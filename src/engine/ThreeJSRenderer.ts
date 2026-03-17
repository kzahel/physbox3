import type { Body, b2ShapeId } from "box2d3";
import * as THREE from "three";
import type { ToolRenderInfo } from "../interaction/ToolHandler";
import { getBodyUserData, isSand, isTerrain } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { Camera } from "./Camera";
import { colorOpacity, parseColor } from "./ColorUtils";
import { KILL_Y, KILL_Y_TOP } from "./Game";
import { type Interpolation, lerpBody, lerpWorldPoint, NO_INTERP } from "./Interpolation";
import type { IRenderer } from "./IRenderer";
import { bodyColor, OverlayRenderer } from "./OverlayRenderer";
import { type Particle, ParticleSystem } from "./ParticleSystem";
import { forEachBody, isCapsuleShape, isCircleShape, isPolygonShape, isSegmentShape } from "./Physics";
import type { JointHandle, PhysWorld } from "./PhysWorld";
import { computeSpringCoilPath } from "./SpringGeometry";
import { computeTerrainFillPath } from "./TerrainGeometry";
import { createPolygonGeometry, EXTRUDE_DEPTH } from "./ThreeGeometryUtils";

function rgbaToThreeColor(color: string): THREE.Color {
  const c = parseColor(color);
  return new THREE.Color(c.r, c.g, c.b);
}

// ── Body-to-mesh key ──

function shapeKey(body: Body): string {
  const B2 = b2();
  let key = "";
  const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
  for (const shapeId of shapeIds) {
    const shapeType = B2.b2Shape_GetType(shapeId);
    key += `${shapeType.value};`;
    if (isCircleShape(shapeType)) {
      const c = B2.b2Shape_GetCircle(shapeId);
      key += `${c.radius.toFixed(4)},`;
    } else if (isPolygonShape(shapeType)) {
      const p = B2.b2Shape_GetPolygon(shapeId);
      for (let i = 0; i < p.count; i++) {
        const v = p.GetVertex(i);
        key += `${v.x.toFixed(4)},${v.y.toFixed(4)},`;
      }
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
  private bodyMeshes = new Map<Body, { group: THREE.Group; key: string }>();
  // Joint -> line sync
  private jointLines = new Map<JointHandle, THREE.Group>();

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

  drawWorld(pw: PhysWorld, camera: Camera, _water?: unknown, interp?: Interpolation) {
    const i = interp ?? NO_INTERP;
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
    this.syncBodies(pw, i);

    // Reconcile joints
    this.syncJoints(pw, i);

    // Update particles
    this.particles.tick();
    this.syncParticles();

    // Debug bounding spheres
    this.syncDebug();

    // Render 3D scene
    this.glRenderer.render(this.scene, this.camera3d);

    // Clear and render 2D overlay
    this.overlayCtx.clearRect(0, 0, this.overlayCanvas.width, this.overlayCanvas.height);
    this.overlay.drawOverlays(pw, camera, i);
  }

  // ── Body sync ──

  private syncBodies(pw: PhysWorld, interp: Interpolation) {
    const seen = new Set<Body>();

    forEachBody(pw, (body) => {
      seen.add(body);
      const { x, y, angle } = lerpBody(body, interp);
      const key = shapeKey(body);

      const existing = this.bodyMeshes.get(body);
      if (existing && existing.key === key) {
        existing.group.position.set(x, y, 0);
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
        const group = this.createBodyMeshes(pw, body);
        group.position.set(x, y, 0);
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

  private createBodyMeshes(pw: PhysWorld, body: Body): THREE.Group {
    const B2 = b2();
    const group = new THREE.Group();
    const ud = getBodyUserData(pw, body);
    const fillColor = ud?.fill ?? bodyColor(pw, body);
    const threeColor = rgbaToThreeColor(fillColor);
    const opacity = colorOpacity(fillColor);
    const isStatic = body.GetType().value === B2.b2BodyType.b2_staticBody.value;

    // Terrain bodies: build mesh from stored points instead of iterating shapes
    if (isTerrain(ud)) {
      const fillPath = computeTerrainFillPath(ud.terrainPoints);
      if (fillPath) {
        const shape = new THREE.Shape();
        shape.moveTo(fillPath[0].x, fillPath[0].y);
        for (let i = 1; i < fillPath.length; i++) shape.lineTo(fillPath[i].x, fillPath[i].y);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, { depth: EXTRUDE_DEPTH, bevelEnabled: false });
        geo.translate(0, 0, -EXTRUDE_DEPTH / 2);
        const mat = new THREE.MeshStandardMaterial({
          color: threeColor,
          transparent: opacity < 1,
          opacity,
          roughness: 0.9,
          metalness: 0.05,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      return group;
    }

    const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
    for (const shapeId of shapeIds) {
      const shapeType = B2.b2Shape_GetType(shapeId);
      const isSensor = B2.b2Shape_IsSensor(shapeId);

      const mat = new THREE.MeshStandardMaterial({
        color: isSensor ? new THREE.Color(0.4, 0.8, 1.0) : threeColor,
        transparent: opacity < 1 || isSensor,
        opacity: isSensor ? 0.15 : opacity,
        roughness: isStatic ? 0.8 : 0.4,
        metalness: isStatic ? 0.1 : 0.3,
        flatShading: true,
      });

      if (isCircleShape(shapeType)) {
        const circle = B2.b2Shape_GetCircle(shapeId);
        const r = circle.radius;
        const center = circle.center;
        const sand = isSand(ud);

        // Sand grains use a simple box for minimal poly count
        const geo = sand ? new THREE.BoxGeometry(r * 1.6, r * 1.6, r * 1.6) : new THREE.SphereGeometry(r, 8, 6);
        geo.translate(center.x, center.y, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = !sand;
        mesh.receiveShadow = !sand;
        group.add(mesh);

        if (!sand) {
          const spokeGeo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(center.x, center.y, r + 0.01),
            new THREE.Vector3(center.x + r, center.y, r + 0.01),
          ]);
          const spokeMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 });
          group.add(new THREE.Line(spokeGeo, spokeMat));
        }
      } else if (isPolygonShape(shapeType)) {
        const poly = B2.b2Shape_GetPolygon(shapeId);
        const verts: { x: number; y: number }[] = [];
        for (let j = 0; j < poly.count; j++) {
          const v = poly.GetVertex(j);
          verts.push({ x: v.x, y: v.y });
        }
        const geo = createPolygonGeometry(verts);
        geo.translate(0, 0, -EXTRUDE_DEPTH / 2);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      } else if (isSegmentShape(shapeType)) {
        const seg = B2.b2Shape_GetSegment(shapeId);
        const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(seg.point1.x, seg.point1.y, 0),
          new THREE.Vector3(seg.point2.x, seg.point2.y, 0),
        ]);
        const lineMat = new THREE.LineBasicMaterial({ color: threeColor, transparent: true, opacity });
        group.add(new THREE.Line(lineGeo, lineMat));
      } else if (isCapsuleShape(shapeType)) {
        // Approximate capsule as a cylinder + hemispheres
        const capsule = B2.b2Shape_GetCapsule(shapeId);
        const p1 = capsule.center1;
        const p2 = capsule.center2;
        const r = capsule.radius;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const len = Math.hypot(dx, dy);

        // Use a cylinder-like extruded shape
        const geo = new THREE.CapsuleGeometry(r, len, 4, 8);
        // CapsuleGeometry is along Y axis, rotate to align with p1->p2
        const capAngle = Math.atan2(dy, dx);
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        geo.rotateZ(capAngle - Math.PI / 2);
        geo.translate(midX, midY, 0);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
    }

    return group;
  }

  // ── Joint sync ──

  private syncJoints(pw: PhysWorld, interp: Interpolation) {
    const B2 = b2();
    const seen = new Set<JointHandle>();

    pw.forEachJoint((joint) => {
      seen.add(joint);

      const jd = pw.getJointData(joint);
      const isStabilizer = !!jd?.ropeStabilizer;

      const bodyA = joint.GetBodyA();
      const bodyB = joint.GetBodyB();
      const localFrameA = joint.GetLocalFrameA();
      const localFrameB = joint.GetLocalFrameB();
      const worldA = bodyA.GetWorldPoint(localFrameA.p);
      const worldB = bodyB.GetWorldPoint(localFrameB.p);
      const a = lerpWorldPoint(bodyA, worldA, interp);
      const b = lerpWorldPoint(bodyB, worldB, interp);

      const existing = this.jointLines.get(joint);
      if (existing) {
        this.updateJointGroup(existing, joint, a, b, pw);
      } else {
        const group = this.createJointGroup(joint, a, b, isStabilizer, B2);
        this.scene.add(group);
        this.jointLines.set(joint, group);
      }
    });

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

  private createJointGroup(
    joint: JointHandle,
    a: { x: number; y: number },
    b: { x: number; y: number },
    isStabilizer: boolean,
    // biome-ignore lint/suspicious/noExplicitAny: WASM module type
    B2: any,
  ): THREE.Group {
    const group = new THREE.Group();
    const isSpring = joint.GetType().value === B2.b2JointType.b2_distanceJoint.value;

    if (isSpring && !isStabilizer) {
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

  private updateJointGroup(
    group: THREE.Group,
    joint: JointHandle,
    a: { x: number; y: number },
    b: { x: number; y: number },
    pw: PhysWorld,
  ) {
    const B2 = b2();
    const jd = pw.getJointData(joint);
    const isStabilizer = !!jd?.ropeStabilizer;
    const isSpring = joint.GetType().value === B2.b2JointType.b2_distanceJoint.value && !isStabilizer;
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
      if (isStabilizer) {
        const restLen = (jd as { restLength?: number })?.restLength ?? 0;
        const currentLen = Math.hypot(b.x - a.x, b.y - a.y);
        const active = currentLen > restLen;
        const mat = line.material as THREE.LineBasicMaterial;
        mat.color.set(active ? 0xff5050 : 0x50c850);
        mat.opacity = active ? 0.5 : 0.3;
      }
    }
    if (group.children.length < 3) return; // stabilizer joints have no dots
    const dotA = group.children[1] as THREE.Mesh;
    dotA.position.set(a.x, a.y, 0.5);
    const dotB = group.children[2] as THREE.Mesh;
    dotB.position.set(b.x, b.y, 0.5);
  }

  private computeSpringCoilPoints(a: { x: number; y: number }, b: { x: number; y: number }): THREE.Vector3[] {
    const path = computeSpringCoilPath(a, b, 12, 0.15);
    return path.map((p) => new THREE.Vector3(p.x, p.y, 0.5));
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
