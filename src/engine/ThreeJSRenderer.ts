import type * as planck from "planck";
import * as THREE from "three";
import type { ToolRenderInfo } from "../interaction/ToolHandler";
import type { FixtureStyle } from "./BodyUserData";
import { getBodyUserData } from "./BodyUserData";
import type { Camera } from "./Camera";
import { KILL_Y, KILL_Y_TOP } from "./Game";
import type { IRenderer } from "./IRenderer";
import { bodyColor, OverlayRenderer } from "./OverlayRenderer";
import { type Particle, ParticleSystem } from "./ParticleSystem";
import { forEachBody } from "./Physics";

// ── Color parsing ──

const _colorCtx = document.createElement("canvas").getContext("2d")!;

function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  _colorCtx.clearRect(0, 0, 1, 1);
  _colorCtx.fillStyle = color;
  _colorCtx.fillRect(0, 0, 1, 1);
  const d = _colorCtx.getImageData(0, 0, 1, 1).data;
  return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
}

function rgbaToThreeColor(color: string): THREE.Color {
  const c = parseColor(color);
  return new THREE.Color(c.r, c.g, c.b);
}

function rgbaToOpacity(color: string): number {
  return parseColor(color).a;
}

// ── Geometry helpers ──

const EXTRUDE_DEPTH = 0.6;

/**
 * Inset a convex polygon by `amount` using proper per-edge offset.
 * Each edge is moved inward by `amount` perpendicular to the edge,
 * then adjacent offset edges are intersected to find new vertices.
 */
function insetConvexPolygon(verts: { x: number; y: number }[], amount: number): { x: number; y: number }[] {
  const n = verts.length;
  let cx = 0,
    cy = 0;
  for (const v of verts) {
    cx += v.x;
    cy += v.y;
  }
  cx /= n;
  cy /= n;

  const edgeNormals: { nx: number; ny: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len,
      ny = dx / len;
    const midX = (a.x + b.x) / 2,
      midY = (a.y + b.y) / 2;
    if (nx * (cx - midX) + ny * (cy - midY) < 0) {
      nx = -nx;
      ny = -ny;
    }
    edgeNormals.push({ nx, ny });
  }

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prevEdge = (i - 1 + n) % n;

    const a0 = verts[prevEdge];
    const a1 = verts[i];
    const nA = edgeNormals[prevEdge];
    const pAx = a0.x + nA.nx * amount,
      pAy = a0.y + nA.ny * amount;
    const dAx = a1.x - a0.x,
      dAy = a1.y - a0.y;

    const b0 = verts[i];
    const b1 = verts[(i + 1) % n];
    const nB = edgeNormals[i];
    const pBx = b0.x + nB.nx * amount,
      pBy = b0.y + nB.ny * amount;
    const dBx = b1.x - b0.x,
      dBy = b1.y - b0.y;

    const cross = dAx * dBy - dAy * dBx;
    if (Math.abs(cross) < 1e-10) {
      result.push({ x: a1.x + nA.nx * amount, y: a1.y + nA.ny * amount });
    } else {
      const t = ((pBx - pAx) * dBy - (pBy - pAy) * dBx) / cross;
      result.push({ x: pAx + t * dAx, y: pAy + t * dAy });
    }
  }
  return result;
}

function createPolygonGeometry(verts: { x: number; y: number }[]): THREE.ExtrudeGeometry {
  const n = verts.length;
  let minEdge = Infinity;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
  }
  const bevel = Math.min(minEdge * 0.12, EXTRUDE_DEPTH * 0.3, 0.08);

  const inset = insetConvexPolygon(verts, bevel);

  const shape = new THREE.Shape();
  shape.moveTo(inset[0].x, inset[0].y);
  for (let i = 1; i < inset.length; i++) {
    shape.lineTo(inset[i].x, inset[i].y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
}

// ── Body-to-mesh key ──

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
  debug = false;

  private scene: THREE.Scene;
  private camera3d: THREE.OrthographicCamera;
  private glRenderer: THREE.WebGLRenderer;

  // Debug bounding sphere wireframes
  private debugMeshes: THREE.LineSegments[] = [];

  // Overlay canvas for 2D UI (tool cursors, buttons, text)
  private overlayCanvas: HTMLCanvasElement;
  private overlayCtx: CanvasRenderingContext2D;
  private overlay: OverlayRenderer;

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

    // Ocean plane (resized each frame to fill viewport)
    const oceanGeo = new THREE.PlaneGeometry(1, 1);
    const oceanMat = new THREE.MeshStandardMaterial({
      color: 0x1a3c78,
      transparent: true,
      opacity: 0.5,
      side: THREE.DoubleSide,
    });
    this.oceanMesh = new THREE.Mesh(oceanGeo, oceanMat);
    this.oceanMesh.receiveShadow = true;
    this.scene.add(this.oceanMesh);

    // Sky plane (resized each frame to fill viewport)
    const skyGeo = new THREE.PlaneGeometry(1, 1);
    const skyMat = new THREE.MeshStandardMaterial({
      color: 0x283c78,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide,
    });
    this.skyMesh = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyMesh);

    // Particle points system
    this.pointsGeometry = new THREE.BufferGeometry();
    this.pointsMaterial = new THREE.PointsMaterial({
      size: 6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      depthTest: false,
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
    this.overlay = new OverlayRenderer(this.overlayCtx, this.overlayCanvas, this.particles);
  }

  dispose() {
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

  setInputManager(input: ToolRenderInfo) {
    this.overlay.setToolInfo(input);
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

    // Update ocean/sky to always cover the visible viewport
    const viewW = halfW * 2 + 2;
    const oceanH = Math.max(0, camera.y - KILL_Y + halfH);
    this.oceanMesh.scale.set(viewW, oceanH, 1);
    this.oceanMesh.position.set(camera.x, KILL_Y - oceanH / 2, -1);
    this.oceanMesh.visible = oceanH > 0;

    const skyH = Math.max(0, KILL_Y_TOP - camera.y + halfH);
    this.skyMesh.scale.set(viewW, skyH, 1);
    this.skyMesh.position.set(camera.x, KILL_Y_TOP + skyH / 2, -1);
    this.skyMesh.visible = skyH > 0;

    // Reconcile bodies
    this.syncBodies(world);

    // Reconcile joints
    this.syncJoints(world);

    // Update particles
    this.particles.tick();
    this.syncParticles();

    // Debug bounding spheres
    this.syncDebug();

    // Render 3D scene
    this.glRenderer.render(this.scene, this.camera3d);

    // Clear and render 2D overlay
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlay.drawOverlays(world, camera);
  }

  // ── Body sync ──

  private syncBodies(world: planck.World) {
    const seen = new Set<planck.Body>();

    forEachBody(world, (body) => {
      seen.add(body);
      const pos = body.getPosition();
      const angle = body.getAngle();
      const key = fixtureKey(body);

      const existing = this.bodyMeshes.get(body);
      if (existing && existing.key === key) {
        existing.group.position.set(pos.x, pos.y, 0);
        existing.group.rotation.set(0, 0, angle);
      } else {
        if (existing) {
          this.scene.remove(existing.group);
          existing.group.traverse((child) => {
            if (child instanceof THREE.Mesh) {
              child.geometry.dispose();
              if (child.material instanceof THREE.Material) child.material.dispose();
            }
          });
        }
        const group = this.createBodyMeshes(body);
        group.position.set(pos.x, pos.y, 0);
        group.rotation.set(0, 0, angle);
        this.scene.add(group);
        this.bodyMeshes.set(body, { group, key });
      }
    });

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
    const ud = getBodyUserData(body);
    const fillColor = ud?.fill ?? bodyColor(body);
    const threeColor = rgbaToThreeColor(fillColor);
    const opacity = rgbaToOpacity(fillColor);
    const isStatic = body.isStatic();

    for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
      const shape = fixture.getShape();
      const fud = fixture.getUserData() as FixtureStyle | null;
      const fColor = fud?.fill ? rgbaToThreeColor(fud.fill) : threeColor;
      const fOpacity = fud?.fill ? rgbaToOpacity(fud.fill) : opacity;
      const isSensor = fixture.isSensor();

      const mat = new THREE.MeshStandardMaterial({
        color: isSensor ? new THREE.Color(0.4, 0.8, 1.0) : fColor,
        transparent: fOpacity < 1 || isSensor,
        opacity: isSensor ? 0.15 : fOpacity,
        roughness: isStatic ? 0.8 : 0.4,
        metalness: isStatic ? 0.1 : 0.3,
        flatShading: true,
      });

      if (shape.getType() === "circle") {
        const circle = shape as planck.CircleShape;
        const r = circle.getRadius();
        const center = circle.getCenter();
        const geo = new THREE.SphereGeometry(r, 8, 6);
        geo.translate(center.x, center.y, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);

        const spokeGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(center.x, center.y, r + 0.01),
          new THREE.Vector3(center.x + r, center.y, r + 0.01),
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
      if (joint.getType() === "rope-joint") {
        const ud = joint.getUserData() as { ropeStabilizer?: boolean } | null;
        if (!ud?.ropeStabilizer) continue;
      }
      const a = joint.getAnchorA();
      const b = joint.getAnchorB();

      const existing = this.jointLines.get(joint);
      if (existing) {
        this.updateJointGroup(existing, joint, a, b);
      } else {
        const group = this.createJointGroup(joint, a, b);
        this.scene.add(group);
        this.jointLines.set(joint, group);
      }
    }

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

    const isStabilizer = (joint.getUserData() as any)?.ropeStabilizer;

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
      const color = isStabilizer ? 0xc8b478 : 0x96c8ff;
      const opacity = isStabilizer ? 0.2 : 0.4;
      const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
      group.add(new THREE.Line(geo, mat));
    }

    if (isStabilizer) {
      // No anchor dots for stabilizer lines — keep them minimal
      return group;
    }

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
    if (group.children.length < 3) return; // stabilizer joints have no dots
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
    this.pointsGeometry.setDrawRange(0, count);
    this.pointsGeometry.computeBoundingSphere();
  }

  // ── Debug bounding spheres ──

  private syncDebug() {
    for (const m of this.debugMeshes) {
      this.scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    }
    this.debugMeshes.length = 0;

    if (!this.debug) return;

    const wireSphereMat = new THREE.LineBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.5 });
    const wireSphereMatParticles = new THREE.LineBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.6 });

    for (const [, entry] of this.bodyMeshes) {
      entry.group.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          if (!child.geometry.boundingSphere) child.geometry.computeBoundingSphere();
          const bs = child.geometry.boundingSphere;
          if (!bs) return;
          const sphere = new THREE.SphereGeometry(bs.radius, 12, 8);
          const wireframe = new THREE.WireframeGeometry(sphere);
          const line = new THREE.LineSegments(wireframe, wireSphereMat.clone());
          const worldCenter = bs.center.clone().applyMatrix4(child.matrixWorld);
          line.position.copy(worldCenter);
          line.position.z = 0.5;
          this.scene.add(line);
          this.debugMeshes.push(line);
        }
      });
    }

    const pbs = this.pointsGeometry.boundingSphere;
    if (pbs && pbs.radius > 0) {
      const sphere = new THREE.SphereGeometry(pbs.radius, 16, 10);
      const wireframe = new THREE.WireframeGeometry(sphere);
      const line = new THREE.LineSegments(wireframe, wireSphereMatParticles);
      line.position.set(pbs.center.x, pbs.center.y, pbs.center.z + this.pointsMesh.position.z);
      this.scene.add(line);
      this.debugMeshes.push(line);
    }
  }
}
