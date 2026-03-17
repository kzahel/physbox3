import type * as planck from "planck";
import * as THREE from "three";
import {
  ERASE_RADIUS_PX,
  GLUE_RADIUS_PX,
  GRAB_RADIUS_PX,
  hasMotor,
  type InputManager,
  isDirectional,
  type Tool,
} from "../interaction/InputManager";
import type { Camera } from "./Camera";
import { KILL_Y, KILL_Y_TOP } from "./Game";
import type { IRenderer } from "./IRenderer";
import { type Particle, ParticleSystem } from "./ParticleSystem";
import { BTN_DIRECTION_OFFSET_Y, BTN_HALF_HEIGHT, BTN_HALF_WIDTH, BTN_SPACING, BTN_TOGGLE_OFFSET_Y } from "./Renderer";

// ── Color parsing ──

function parseRGBA(color: string): { r: number; g: number; b: number; a: number } {
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
  if (!m) return { r: 120, g: 160, b: 255, a: 0.6 };
  return {
    r: parseInt(m[1], 10) / 255,
    g: parseInt(m[2], 10) / 255,
    b: parseInt(m[3], 10) / 255,
    a: m[4] != null ? parseFloat(m[4]) : 1,
  };
}

function rgbaToThreeColor(color: string): THREE.Color {
  const c = parseRGBA(color);
  return new THREE.Color(c.r, c.g, c.b);
}

function rgbaToOpacity(color: string): number {
  return parseRGBA(color).a;
}

// ── Cursor styles (same as Canvas renderer) ──

interface CursorStyle {
  radius: number;
  stroke: string;
  fill: string;
}

const TOOL_CURSORS: Partial<Record<Tool, CursorStyle>> = {
  erase: { radius: ERASE_RADIUS_PX, stroke: "rgba(255, 80, 80, 0.7)", fill: "rgba(255, 80, 80, 0.1)" },
  grab: { radius: GRAB_RADIUS_PX, stroke: "rgba(100, 200, 255, 0.5)", fill: "rgba(100, 200, 255, 0.05)" },
  attach: { radius: 10, stroke: "rgba(255, 200, 50, 0.6)", fill: "rgba(255, 200, 50, 0.05)" },
  detach: { radius: 10, stroke: "rgba(255, 100, 50, 0.6)", fill: "rgba(255, 100, 50, 0.05)" },
  attract: { radius: 10, stroke: "rgba(50, 255, 150, 0.6)", fill: "rgba(50, 255, 150, 0.05)" },
  ropetool: { radius: 10, stroke: "rgba(180, 160, 120, 0.6)", fill: "rgba(180, 160, 120, 0.05)" },
  spring: { radius: 10, stroke: "rgba(180, 160, 120, 0.6)", fill: "rgba(180, 160, 120, 0.05)" },
  glue: { radius: GLUE_RADIUS_PX, stroke: "rgba(255, 220, 50, 0.7)", fill: "rgba(255, 220, 50, 0.1)" },
  unglue: { radius: GLUE_RADIUS_PX, stroke: "rgba(255, 120, 50, 0.7)", fill: "rgba(255, 120, 50, 0.1)" },
  scale: { radius: 14, stroke: "rgba(180, 120, 255, 0.6)", fill: "rgba(180, 120, 255, 0.05)" },
};

// ── Geometry helpers ──

const EXTRUDE_DEPTH = 0.4;

function createCircleGeometry(radius: number, centerX: number, centerY: number): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.absarc(centerX, centerY, radius, 0, Math.PI * 2, false);
  return new THREE.ExtrudeGeometry(shape, {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 2,
    curveSegments: 24,
  });
}

function createPolygonGeometry(verts: { x: number; y: number }[]): THREE.ExtrudeGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(verts[0].x, verts[0].y);
  for (let i = 1; i < verts.length; i++) {
    shape.lineTo(verts[i].x, verts[i].y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 1,
  });
}

// ── Body-to-mesh key ──

/** Unique key for a fixture to detect shape changes. */
function fixtureKey(body: planck.Body): string {
  let key = "";
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const s = f.getShape();
    key += `${s.getType()};`;
    if (s.getType() === "circle") {
      const c = s as planck.CircleShape;
      key += `${c.getRadius().toFixed(4)},`;
    } else if (s.getType() === "polygon") {
      const p = s as planck.PolygonShape;
      for (const v of p.m_vertices) key += `${v.x.toFixed(4)},${v.y.toFixed(4)},`;
    }
  }
  return key;
}

// ── ThreeJSRenderer ──

export class ThreeJSRenderer implements IRenderer {
  readonly particles = new ParticleSystem();

  private scene: THREE.Scene;
  private camera3d: THREE.OrthographicCamera;
  private glRenderer: THREE.WebGLRenderer;
  private inputManager: InputManager | null = null;

  // Overlay canvas for 2D UI (tool cursors, buttons, text)
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;

  // Body -> mesh sync
  private bodyMeshes = new Map<planck.Body, { group: THREE.Group; key: string }>();
  // Joint -> line sync
  private jointLines = new Map<planck.Joint, THREE.Group>();

  // Environment
  private oceanMesh: THREE.Mesh;
  private skyMesh: THREE.Mesh;

  // Particle points
  private pointsGeometry: THREE.BufferGeometry;
  private pointsMaterial: THREE.PointsMaterial;
  private pointsMesh: THREE.Points;

  // The container element holding canvases
  private container: HTMLElement;
  // The original 2D canvas (hidden while 3D is active)
  private canvas2d: HTMLCanvasElement;
  // The WebGL canvas we create
  private glCanvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas2d = canvas;
    this.container = canvas.parentElement!;

    // Create a new canvas for WebGL (can't reuse a canvas that already has a 2D context)
    this.glCanvas = document.createElement("canvas");
    this.glCanvas.style.cssText = "display:block;width:100%;height:100%;cursor:crosshair;touch-action:none;";
    this.container.insertBefore(this.glCanvas, canvas);
    canvas.style.display = "none";

    this.glRenderer = new THREE.WebGLRenderer({
      canvas: this.glCanvas,
      antialias: true,
      alpha: true,
    });
    this.glRenderer.shadowMap.enabled = true;
    this.glRenderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.glRenderer.setClearColor(0x000000, 0);

    // Scene
    this.scene = new THREE.Scene();

    // Orthographic camera (will be synced to 2D camera each frame)
    this.camera3d = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 200);
    this.camera3d.position.set(0, 0, 50);
    this.camera3d.lookAt(0, 0, 0);

    // Lighting
    const ambient = new THREE.AmbientLight(0x606070, 1.5);
    this.scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(5, 10, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.set(1024, 1024);
    dirLight.shadow.camera.left = -60;
    dirLight.shadow.camera.right = 60;
    dirLight.shadow.camera.top = 60;
    dirLight.shadow.camera.bottom = -60;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 100;
    this.scene.add(dirLight);

    const rimLight = new THREE.DirectionalLight(0x4488ff, 0.6);
    rimLight.position.set(-5, -3, 15);
    this.scene.add(rimLight);

    // Ocean plane
    const oceanGeo = new THREE.PlaneGeometry(300, 200);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1a3c78,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.oceanMesh.position.set(0, KILL_Y - 100, -1);
    this.oceanMesh.receiveShadow = true;
    this.scene.add(this.oceanMesh);

    // Sky plane
    const skyGeo = new THREE.PlaneGeometry(300, 200);
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x283c78,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.skyMesh.position.set(0, KILL_Y_TOP + 100, -1);
    this.scene.add(this.skyMesh);

    // Particle points system
    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsMaterial = new THREE.PointsMaterial({
      size: 0.15,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.pointsMesh = new THREE.Points(this.pointsGeometry, this.pointsMaterial);
    this.pointsMesh.position.z = 1;
    this.scene.add(this.pointsMesh);

    // Overlay canvas for 2D UI (tool cursors, buttons, text)
    this.overlayCanvas = document.createElement("canvas");
    this.overlayCanvas.style.cssText =
      "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:1;";
    this.container.appendChild(this.overlayCanvas);
    this.overlayCtx = this.overlayCanvas.getContext("2d")!;
  }

  dispose() {
    // Remove all meshes
    for (const [, entry] of this.bodyMeshes) {
      this.scene.remove(entry.group);
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
    }
    this.bodyMeshes.clear();
    for (const [, group] of this.jointLines) {
      this.scene.remove(group);
    }
    this.jointLines.clear();

    this.pointsGeometry.dispose();
    this.pointsMaterial.dispose();

    this.glRenderer.dispose();
    this.overlayCanvas.remove();
    this.glCanvas.remove();

    // Restore original 2D canvas
    this.canvas2d.style.display = "";
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = this.glCanvas.clientWidth;
    const h = this.glCanvas.clientHeight;
    this.glRenderer.setSize(w, h, false);
    this.glRenderer.setPixelRatio(dpr);

    this.overlayCanvas.width = w * dpr;
    this.overlayCanvas.height = h * dpr;
    this.overlayCanvas.style.width = `${w}px`;
    this.overlayCanvas.style.height = `${h}px`;
    this.overlayCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setInputManager(input: InputManager) {
    this.inputManager = input;
  }

  drawWorld(world: planck.World, camera: Camera) {
    const cw = this.glCanvas.clientWidth;
    const ch = this.glCanvas.clientHeight;

    // Sync orthographic camera to 2D camera
    const halfW = cw / (2 * camera.zoom);
    const halfH = ch / (2 * camera.zoom);
    this.camera3d.left = -halfW;
    this.camera3d.right = halfW;
    this.camera3d.top = halfH;
    this.camera3d.bottom = -halfH;
    this.camera3d.position.set(camera.x, camera.y, 50);
    this.camera3d.lookAt(camera.x, camera.y, 0);
    this.camera3d.updateProjectionMatrix();

    // Reconcile bodies
    this.syncBodies(world);

    // Reconcile joints
    this.syncJoints(world);

    // Update particles
    this.particles.tick();
    this.syncParticles();

    // Render 3D scene
    this.glRenderer.render(this.scene, this.camera3d);

    // Clear and render 2D overlay
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.drawOverlay(world, camera);
  }

  // ── Body sync ──

  private syncBodies(world: planck.World) {
    const seen = new Set<planck.Body>();

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      seen.add(body);
      const pos = body.getPosition();
      const angle = body.getAngle();
      const key = fixtureKey(body);

      const existing = this.bodyMeshes.get(body);
      if (existing && existing.key === key) {
        // Update transform
        existing.group.position.set(pos.x, pos.y, 0);
        existing.group.rotation.set(0, 0, angle);
      } else {
        // Remove old if shape changed
        if (existing) {
          this.scene.remove(existing.group);
          existing.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) child.material.dispose();
            }
          });
        }
        // Create new
        const group = this.createBodyMeshes(body);
        group.position.set(pos.x, pos.y, 0);
        group.rotation.set(0, 0, angle);
        this.scene.add(group);
        this.bodyMeshes.set(body, { group, key });
      }
    }

    // Remove destroyed bodies
    for (const [body, entry] of this.bodyMeshes) {
      if (!seen.has(body)) {
        this.scene.remove(entry.group);
        entry.group.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) child.material.dispose();
          }
        });
        this.bodyMeshes.delete(body);
      }
    }
  }

  private createBodyMeshes(body: planck.Body): THREE.Group {
    const group = new THREE.Group();
    const ud = body.getUserData() as { fill?: string; label?: string } | null;
    const fillColor = ud?.fill ?? this.bodyColor(body);
    const threeColor = rgbaToThreeColor(fillColor);
    const opacity = rgbaToOpacity(fillColor);
    const isStatic = body.isStatic();

    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      const shape = fixture.getShape();
      const fud = fixture.getUserData() as { fill?: string } | null;
      const fColor = fud?.fill ? rgbaToThreeColor(fud.fill) : threeColor;
      const fOpacity = fud?.fill ? rgbaToOpacity(fud.fill) : opacity;
      const isSensor = fixture.isSensor();

      const mat = new THREE.MeshStandardMaterial({
        color: isSensor ? new THREE.Color(0.4, 0.8, 1.0) : fColor,
        transparent: fOpacity < 1 || isSensor,
        opacity: isSensor ? 0.15 : fOpacity,
        roughness: isStatic ? 0.8 : 0.4,
        metalness: isStatic ? 0.1 : 0.3,
      });

      if (shape.getType() === "circle") {
        const circle = shape as planck.CircleShape;
        const r = circle.getRadius();
        const center = circle.getCenter();
        const geo = createCircleGeometry(r, center.x, center.y);
        geo.translate(0, 0, -EXTRUDE_DEPTH / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        // Spoke line for rotation visibility
        const spokeGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(center.x, center.y, EXTRUDE_DEPTH / 2 + 0.01),
          new THREE.Vector3(center.x + r, center.y, EXTRUDE_DEPTH / 2 + 0.01),
        ]);
        const spokeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
        group.add(new THREE.Line(spokeGeo, spokeMat));
      } else if (shape.getType() === "polygon") {
        const poly = shape as planck.PolygonShape;
        const geo = createPolygonGeometry(poly.m_vertices);
        geo.translate(0, 0, -EXTRUDE_DEPTH / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      } else if (shape.getType() === "edge") {
        const edge = shape as planck.EdgeShape;
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(edge.m_vertex1.x, edge.m_vertex1.y, 0),
          new THREE.Vector3(edge.m_vertex2.x, edge.m_vertex2.y, 0),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: fColor, transparent: true, opacity: fOpacity });
        group.add(new THREE.Line(lineGeo, lineMat));
      } else if (shape.getType() === "chain") {
        const chain = shape as planck.ChainShape;
        const points = chain.m_vertices.map((v) => new THREE.Vector3(v.x, v.y, 0));
        const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
        const lineMat = new THREE.LineBasicMaterial({ color: fColor, transparent: true, opacity: fOpacity });
        group.add(new THREE.Line(lineGeo, lineMat));
      }
    }

    return group;
  }

  // ── Joint sync ──

  private syncJoints(world: planck.World) {
    const seen = new Set<planck.Joint>();

    for (let joint = world.getJointList(); joint; joint = joint.getNext()) {
      seen.add(joint);
      const a = joint.getAnchorA();
      const b = joint.getAnchorB();

      const existing = this.jointLines.get(joint);
      if (existing) {
        // Update positions
        this.updateJointGroup(existing, joint, a, b);
      } else {
        const group = this.createJointGroup(joint, a, b);
        this.scene.add(group);
        this.jointLines.set(joint, group);
      }
    }

    // Remove destroyed joints
    for (const [joint, group] of this.jointLines) {
      if (!seen.has(joint)) {
        this.scene.remove(group);
        group.traverse((child) => {
          if (child instanceof THREE.Line) {
            child.geometry.dispose();
            if (child.material instanceof THREE.Material) child.material.dispose();
          }
        });
        this.jointLines.delete(joint);
      }
    }
  }

  private createJointGroup(joint: planck.Joint, a: planck.Vec2Value, b: planck.Vec2Value): THREE.Group {
    const group = new THREE.Group();
    const isSpring = joint.getType() === "distance-joint";

    if (isSpring) {
      const points = this.computeSpringCoilPoints(a, b);
      const geo = new THREE.BufferGeometry().setFromPoints(points);
      const mat = new THREE.LineBasicMaterial({ color: 0xc8dcff, transparent: true, opacity: 0.7 });
      group.add(new THREE.Line(geo, mat));
    } else {
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(a.x, a.y, 0.5),
        new THREE.Vector3(b.x, b.y, 0.5),
      ]);
      const mat = new THREE.LineBasicMaterial({ color: 0x96c8ff, transparent: true, opacity: 0.4 });
      group.add(new THREE.Line(geo, mat));
    }

    // Anchor dots
    const dotGeo = new THREE.SphereGeometry(0.08, 8, 8);
    const dotMat = new THREE.MeshBasicMaterial({ color: 0x96c8ff, transparent: true, opacity: 0.6 });
    const dotA = new THREE.Mesh(dotGeo, dotMat);
    dotA.position.set(a.x, a.y, 0.5);
    group.add(dotA);
    const dotB = new THREE.Mesh(dotGeo.clone(), dotMat.clone());
    dotB.position.set(b.x, b.y, 0.5);
    group.add(dotB);

    return group;
  }

  private updateJointGroup(group: THREE.Group, joint: planck.Joint, a: planck.Vec2Value, b: planck.Vec2Value) {
    const isSpring = joint.getType() === "distance-joint";
    const line = group.children[0] as THREE.Line;
    if (isSpring) {
      const points = this.computeSpringCoilPoints(a, b);
      line.geometry.dispose();
      line.geometry = new THREE.BufferGeometry().setFromPoints(points);
    } else {
      const positions = line.geometry.attributes.position as THREE.BufferAttribute;
      positions.setXYZ(0, a.x, a.y, 0.5);
      positions.setXYZ(1, b.x, b.y, 0.5);
      positions.needsUpdate = true;
    }
    // Update anchor dots
    const dotA = group.children[1] as THREE.Mesh;
    dotA.position.set(a.x, a.y, 0.5);
    const dotB = group.children[2] as THREE.Mesh;
    dotB.position.set(b.x, b.y, 0.5);
  }

  private computeSpringCoilPoints(a: planck.Vec2Value, b: planck.Vec2Value): THREE.Vector3[] {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) return [new THREE.Vector3(a.x, a.y, 0.5), new THREE.Vector3(b.x, b.y, 0.5)];

    const coils = 12;
    const amplitude = 0.15;
    const nx = -dy / len;
    const ny = dx / len;

    const points: THREE.Vector3[] = [new THREE.Vector3(a.x, a.y, 0.5)];
    for (let i = 1; i <= coils * 2; i++) {
      const t = i / (coils * 2 + 1);
      const side = i % 2 === 1 ? 1 : -1;
      points.push(new THREE.Vector3(a.x + dx * t + nx * amplitude * side, a.y + dy * t + ny * amplitude * side, 0.5));
    }
    points.push(new THREE.Vector3(b.x, b.y, 0.5));
    return points;
  }

  // ── Particles ──

  private syncParticles() {
    const particles = this.particles.getParticles();
    const count = particles.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const p = particles[i] as Particle;
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.y;
      positions[i * 3 + 2] = 1;

      const alpha = p.life / p.maxLife;
      colors[i * 3] = (p.r / 255) * alpha;
      colors[i * 3 + 1] = (p.g / 255) * alpha;
      colors[i * 3 + 2] = (p.b / 255) * alpha;
    }

    this.pointsGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.pointsGeometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  }

  // ── 2D Overlay (tool cursors, buttons, previews) ──

  private drawOverlay(world: planck.World, camera: Camera) {
    const ctx = this.overlayCtx;
    // Dynamite wick effects (drawn in overlay)
    this.drawDynamiteEffects(world, camera);

    // Conveyor animation
    this.drawConveyorAnimation(world, camera);

    // Balloon strings
    this.drawBalloonStrings(world, camera);

    // Tool cursor
    if (this.inputManager?.toolCursor) {
      const tool = this.inputManager.tool;
      const pos = this.inputManager.toolCursor;
      if (tool !== "scale" || !this.inputManager?.scaleDrag) {
        const style = TOOL_CURSORS[tool];
        if (style) this.drawToolCursor(pos, style.radius, style.stroke, style.fill);
      }
    }

    // Platform draw preview
    if (this.inputManager?.platformDraw) {
      const tool = this.inputManager.tool;
      const isFan = tool === "fan";
      const isCannon = tool === "cannon";
      const isRocket = tool === "rocket";
      const isConveyor = tool === "conveyor";
      const { start, end } = this.inputManager.platformDraw;
      const s = camera.toScreen(start.x, start.y, this.glCanvas);
      const e = camera.toScreen(end.x, end.y, this.glCanvas);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      const color = isFan
        ? "rgba(120, 180, 220, 0.9)"
        : isCannon
          ? "rgba(180, 80, 80, 0.9)"
          : isRocket
            ? "rgba(200, 200, 220, 0.9)"
            : isConveyor
              ? "rgba(200, 160, 50, 0.9)"
              : "rgba(80, 100, 80, 0.9)";
      ctx.strokeStyle = color;
      ctx.lineWidth = Math.max(4, 0.3 * camera.zoom);
      ctx.lineCap = "round";
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      for (const p of [s, e]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      if (isFan || isCannon || isRocket) {
        const dx = e.x - s.x;
        const dy = e.y - s.y;
        const len = Math.hypot(dx, dy);
        if (len > 10) {
          const nx = dx / len;
          const ny = dy / len;
          ctx.beginPath();
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x - nx * 12 - ny * 8, e.y - ny * 12 + nx * 8);
          ctx.moveTo(e.x, e.y);
          ctx.lineTo(e.x - nx * 12 + ny * 8, e.y - ny * 12 - nx * 8);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2.5;
          ctx.setLineDash([]);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // Rope pending
    if (this.inputManager?.ropePending) {
      const rp = this.inputManager.ropePending;
      const sp = rp.body
        ? camera.toScreen(rp.body.getPosition().x, rp.body.getPosition().y, this.glCanvas)
        : camera.toScreen(rp.x, rp.y, this.glCanvas);
      this.drawToolCursor(sp, 16, "rgba(180, 160, 120, 0.9)", "rgba(180, 160, 120, 0.15)");
    }

    // Attach pending
    if (this.inputManager?.attachPending) {
      const body = this.inputManager.attachPending.body;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.glCanvas);
      this.drawToolCursor(sp, 16, "rgba(255, 200, 50, 0.9)", "rgba(255, 200, 50, 0.15)");
    }

    // Scale preview
    if (this.inputManager?.scaleDrag) {
      const sd = this.inputManager.scaleDrag;
      const bpos = sd.body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.glCanvas);
      const ringSize = 20 * sd.currentScale;
      this.drawToolCursor(sp, ringSize, "rgba(180, 120, 255, 0.8)", "rgba(180, 120, 255, 0.1)");
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${sd.currentScale.toFixed(1)}x`, sp.x, sp.y - ringSize - 14);
    }

    // Select tool UI
    if (this.inputManager?.selectedBody) {
      const body = this.inputManager.selectedBody;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.glCanvas);
      this.drawToolCursor(sp, 20, "rgba(100, 200, 255, 0.8)", "rgba(100, 200, 255, 0.08)");
      this.drawToggleButton(sp, body.isStatic());
      let nextBtnY = BTN_DIRECTION_OFFSET_Y;
      if (isDirectional(body)) {
        this.drawDirectionButton(sp, nextBtnY);
        nextBtnY += BTN_SPACING;
      }
      this.drawMotorButton(sp, nextBtnY, hasMotor(body));
    }
  }

  // ── Overlay drawing helpers ──

  private drawToolCursor(pos: { x: number; y: number }, radius: number, stroke: string, fill: string) {
    const ctx = this.overlayCtx;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([]);
  }

  private drawPillButton(x: number, y: number, label: string, bg: string) {
    const ctx = this.overlayCtx;
    const h = BTN_HALF_HEIGHT * 2;
    ctx.beginPath();
    ctx.roundRect(x - BTN_HALF_WIDTH, y - BTN_HALF_HEIGHT, BTN_HALF_WIDTH * 2, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);
  }

  private drawToggleButton(bodyScreen: { x: number; y: number }, isStatic: boolean) {
    this.drawPillButton(
      bodyScreen.x,
      bodyScreen.y - BTN_TOGGLE_OFFSET_Y,
      isStatic ? "Fixed" : "Free",
      isStatic ? "rgba(200, 80, 80, 0.85)" : "rgba(80, 160, 80, 0.85)",
    );
  }

  private drawDirectionButton(bodyScreen: { x: number; y: number }, offsetY = BTN_DIRECTION_OFFSET_Y) {
    this.drawPillButton(bodyScreen.x, bodyScreen.y - offsetY, "\u21C4 Flip", "rgba(100, 140, 255, 0.85)");
  }

  private drawMotorButton(bodyScreen: { x: number; y: number }, offsetY: number, active: boolean) {
    this.drawPillButton(
      bodyScreen.x,
      bodyScreen.y - offsetY,
      "\u2699 Motor",
      active ? "rgba(255, 160, 50, 0.85)" : "rgba(120, 120, 140, 0.85)",
    );
  }

  private drawConveyorAnimation(world: planck.World, camera: Camera) {
    const ctx = this.overlayCtx;
    const time = performance.now() / 1000;

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; speed?: number } | null;
      if (ud?.label !== "conveyor") continue;

      const speed = ud.speed ?? 3;
      const pos = body.getPosition();
      const angle = body.getAngle();
      const fixture = body.getFixtureList();
      if (!fixture) continue;
      const shape = fixture.getShape() as planck.PolygonShape;
      const hw = Math.abs(shape.m_vertices[0].x);

      ctx.save();
      const screen = camera.toScreen(pos.x, pos.y, this.glCanvas);
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-angle);

      const spacing = 0.8;
      const offset = (time * speed) % spacing;
      const count = Math.ceil((hw * 2) / spacing) + 1;
      const chevronSize = 0.15 * camera.zoom;

      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = Math.max(1, 0.06 * camera.zoom);
      ctx.lineCap = "round";

      for (let i = 0; i < count; i++) {
        const lx = (-hw + offset + i * spacing) * camera.zoom;
        if (Math.abs(lx) > hw * camera.zoom) continue;
        const ly = 0;
        const dir = speed > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(lx - chevronSize * dir, ly - chevronSize);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx - chevronSize * dir, ly + chevronSize);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  private drawBalloonStrings(world: planck.World, camera: Camera) {
    const ctx = this.overlayCtx;
    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; fill?: string } | null;
      if (ud?.label !== "balloon") continue;

      const pos = body.getPosition();
      const angle = body.getAngle();
      const fixture = body.getFixtureList();
      if (!fixture) continue;
      const shape = fixture.getShape() as planck.CircleShape;
      const radius = shape.getRadius();

      const bottomX = pos.x - Math.sin(angle) * radius;
      const bottomY = pos.y - Math.cos(angle) * radius;
      const stringLen = radius * 3;
      const sp = camera.toScreen(bottomX, bottomY, this.glCanvas);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      const segments = 3;
      const segLen = (stringLen * camera.zoom) / segments;
      for (let i = 0; i < segments; i++) {
        const wobble = (i % 2 === 0 ? 1 : -1) * 4;
        ctx.quadraticCurveTo(sp.x + wobble, sp.y + segLen * (i + 0.5), sp.x, sp.y + segLen * (i + 1));
      }
      ctx.strokeStyle = ud.fill ?? "rgba(200,200,200,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawDynamiteEffects(world: planck.World, camera: Camera) {
    const now = performance.now();
    const ctx = this.overlayCtx;

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; fuseStart?: number; fuseDuration?: number } | null;
      if (ud?.label !== "dynamite" || !ud.fuseStart || !ud.fuseDuration) continue;

      const elapsed = (now - ud.fuseStart) / 1000;
      const remaining = Math.max(0, 1 - elapsed / ud.fuseDuration);

      const pos = body.getPosition();
      const angle = body.getAngle();

      const wickBaseX = pos.x + Math.sin(-angle) * 0.4;
      const wickBaseY = pos.y + Math.cos(-angle) * 0.4;
      const wickLen = 0.5 * remaining;
      const wickEndX = wickBaseX + Math.sin(-angle) * wickLen;
      const wickEndY = wickBaseY + Math.cos(-angle) * wickLen;

      const wbSp = camera.toScreen(wickBaseX, wickBaseY, this.glCanvas);
      const weSp = camera.toScreen(wickEndX, wickEndY, this.glCanvas);

      ctx.beginPath();
      ctx.moveTo(wbSp.x, wbSp.y);
      ctx.lineTo(weSp.x, weSp.y);
      ctx.strokeStyle = "rgba(80,60,40,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (remaining > 0) {
        this.particles.spawnSpark(wickEndX, wickEndY);
        ctx.beginPath();
        ctx.arc(weSp.x, weSp.y, 4 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 100)},50,${0.5 + Math.random() * 0.3})`;
        ctx.fill();
      }
    }
  }

  // ── Helpers ──

  private bodyColor(body: planck.Body): string {
    if (body.isStatic()) return "rgba(80,80,100,0.8)";
    if (body.isKinematic()) return "rgba(100,180,100,0.6)";
    const ud = body.getUserData() as { fill?: string } | null;
    return ud?.fill ?? "rgba(120,160,255,0.6)";
  }
}
