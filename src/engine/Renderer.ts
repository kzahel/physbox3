import type { b2ShapeId } from "box2d3";
import type { ToolRenderInfo } from "../interaction/ToolHandler";
import { isJelly, isTerrain } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { Camera } from "./Camera";
import { KILL_Y, KILL_Y_TOP } from "./Game";
import { type Interpolation, lerpBody, lerpWorldPoint, NO_INTERP } from "./Interpolation";
import type { IRenderer } from "./IRenderer";
import { bodyColor, OverlayRenderer } from "./OverlayRenderer";
import { ParticleSystem } from "./ParticleSystem";
import { forEachBody, isCapsuleShape, isCircleShape, isPolygonShape, isSegmentShape } from "./Physics";
import type { PhysWorld } from "./PhysWorld";
import { computeSpringCoilPath } from "./SpringGeometry";
import { computeTerrainFillPath } from "./TerrainGeometry";
import type { WaterSystem } from "./WaterSystem";

// Ocean wave parameters (frequency, amplitude pairs)
const OCEAN_WAVE_A = { freq: 0.8, amp: 2 };
const OCEAN_WAVE_B = { freq: 1.5, amp: 1 };

// Sky wisp parameters (frequency, amplitude pairs)
const SKY_WISP_A = { freq: 0.5, amp: 3 };
const SKY_WISP_B = { freq: 1.2, amp: 1.5 };

/** Ocean surface wave displacement in world units */
function oceanWave(wx: number): number {
  return Math.sin(wx * OCEAN_WAVE_A.freq) * OCEAN_WAVE_A.amp + Math.sin(wx * OCEAN_WAVE_B.freq) * OCEAN_WAVE_B.amp;
}

/** Sky boundary wisp displacement in world units */
function cloudWisp(wx: number): number {
  return Math.sin(wx * SKY_WISP_A.freq) * SKY_WISP_A.amp + Math.sin(wx * SKY_WISP_B.freq) * SKY_WISP_B.amp;
}

export class Renderer implements IRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  readonly particles = new ParticleSystem();
  private overlay: OverlayRenderer;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
    this.overlay = new OverlayRenderer(this.ctx, this.canvas, this.particles);
  }

  dispose() {
    // Nothing to clean up for Canvas 2D
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawWorld(pw: PhysWorld, camera: Camera, water?: WaterSystem, interp?: Interpolation) {
    const i = interp ?? NO_INTERP;
    this.clear();
    this.drawOcean(camera);
    this.drawSky(camera);
    this.drawTerrain(pw, camera);
    this.drawJellyFills(pw, camera, i);
    this.drawBodies(pw, camera, i);
    this.drawJoints(pw, camera, i);
    if (water) this.drawWater(water, camera);
    this.particles.tick();
    this.drawParticles(camera);
    this.overlay.drawOverlays(pw, camera, i);
  }

  setInputManager(input: ToolRenderInfo) {
    this.overlay.setToolInfo(input);
  }

  private drawTerrain(pw: PhysWorld, camera: Camera) {
    const ctx = this.ctx;

    forEachBody(pw, (body) => {
      const ud = pw.getUserData(body);
      if (!isTerrain(ud)) return;

      const fillPath = computeTerrainFillPath(ud.terrainPoints);
      if (!fillPath) return;

      const pts = ud.terrainPoints;
      ctx.save();

      // Draw filled polygon (surface + bottom closure)
      ctx.beginPath();
      const s0 = camera.toScreen(fillPath[0].x, fillPath[0].y, this.canvas);
      ctx.moveTo(s0.x, s0.y);
      for (let i = 1; i < fillPath.length; i++) {
        const s = camera.toScreen(fillPath[i].x, fillPath[i].y, this.canvas);
        ctx.lineTo(s.x, s.y);
      }
      ctx.closePath();
      ctx.fillStyle = ud.fill ?? "rgba(80,100,60,0.9)";
      ctx.fill();

      // Draw surface stroke
      ctx.beginPath();
      const ss0 = camera.toScreen(pts[0].x, pts[0].y, this.canvas);
      ctx.moveTo(ss0.x, ss0.y);
      for (let i = 1; i < pts.length; i++) {
        const s = camera.toScreen(pts[i].x, pts[i].y, this.canvas);
        ctx.lineTo(s.x, s.y);
      }
      ctx.strokeStyle = "rgba(120,140,80,0.9)";
      ctx.lineWidth = Math.max(2, 0.08 * camera.zoom);
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();

      ctx.restore();
    });
  }

  private drawJellyFills(pw: PhysWorld, camera: Camera, interp: Interpolation) {
    const ctx = this.ctx;

    forEachBody(pw, (body) => {
      const ud = pw.getUserData(body);
      if (!isJelly(ud) || !ud.jellyPerimeter) return;

      const perim = ud.jellyPerimeter;
      if (perim.length < 3) return;

      // Collect interpolated screen positions of perimeter nodes
      const pts: { x: number; y: number }[] = [];
      for (const b of perim) {
        if (!b.IsValid()) return;
        const { x, y } = lerpBody(b, interp);
        pts.push(camera.toScreen(x, y, this.canvas));
      }

      // Draw filled shape with smooth bezier curves through perimeter
      ctx.save();
      const fill = ud.jellyFill ?? "rgba(60,200,60,0.45)";
      ctx.fillStyle = fill;
      ctx.strokeStyle = fill.replace(/[\d.]+\)$/, "0.8)");
      ctx.lineWidth = Math.max(1.5, 0.06 * camera.zoom);
      ctx.lineJoin = "round";

      ctx.beginPath();
      const n = pts.length;
      // Start at midpoint between last and first point
      const mx0 = (pts[n - 1].x + pts[0].x) / 2;
      const my0 = (pts[n - 1].y + pts[0].y) / 2;
      ctx.moveTo(mx0, my0);

      for (let i = 0; i < n; i++) {
        const next = (i + 1) % n;
        const mx = (pts[i].x + pts[next].x) / 2;
        const my = (pts[i].y + pts[next].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
      }

      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    });
  }

  private drawBodies(pw: PhysWorld, camera: Camera, interp: Interpolation) {
    const ctx = this.ctx;
    const B2 = b2();

    forEachBody(pw, (body) => {
      const { x, y, angle } = lerpBody(body, interp);
      const ud = pw.getUserData(body);
      if (isTerrain(ud)) return; // rendered in drawTerrain
      const fillColor = ud?.fill ?? bodyColor(pw, body);
      const strokeColor = ud?.stroke ?? "rgba(255,255,255,0.3)";

      const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
      for (const shapeId of shapeIds) {
        const shapeType = B2.b2Shape_GetType(shapeId);
        const isSensor = B2.b2Shape_IsSensor(shapeId);

        ctx.save();

        const screen = camera.toScreen(x, y, this.canvas);
        ctx.translate(screen.x, screen.y);
        ctx.rotate(-angle);
        ctx.scale(camera.zoom, -camera.zoom);

        ctx.fillStyle = isSensor ? "rgba(100,200,255,0.15)" : fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1 / camera.zoom;

        if (isCircleShape(shapeType)) {
          const circle = B2.b2Shape_GetCircle(shapeId);
          const r = circle.radius;
          const center = circle.center;
          ctx.beginPath();
          ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(center.x + r, center.y);
          ctx.stroke();
        } else if (isPolygonShape(shapeType)) {
          const poly = B2.b2Shape_GetPolygon(shapeId);
          ctx.beginPath();
          const v0 = poly.GetVertex(0);
          ctx.moveTo(v0.x, v0.y);
          for (let i = 1; i < poly.count; i++) {
            const v = poly.GetVertex(i);
            ctx.lineTo(v.x, v.y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (isSegmentShape(shapeType)) {
          const seg = B2.b2Shape_GetSegment(shapeId);
          ctx.beginPath();
          ctx.moveTo(seg.point1.x, seg.point1.y);
          ctx.lineTo(seg.point2.x, seg.point2.y);
          ctx.stroke();
        } else if (isCapsuleShape(shapeType)) {
          const capsule = B2.b2Shape_GetCapsule(shapeId);
          const p1 = capsule.center1;
          const p2 = capsule.center2;
          const r = capsule.radius;
          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const len = Math.hypot(dx, dy);
          const capAngle = len > 0 ? Math.atan2(dy, dx) : 0;
          ctx.save();
          ctx.translate(p1.x, p1.y);
          ctx.rotate(capAngle);
          ctx.beginPath();
          ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2);
          ctx.arc(len, 0, r, -Math.PI / 2, Math.PI / 2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
          ctx.restore();
        }

        ctx.restore();
      }
    });
  }

  private drawJoints(pw: PhysWorld, camera: Camera, interp: Interpolation) {
    const ctx = this.ctx;
    const B2 = b2();

    pw.forEachJoint((joint) => {
      const bodyA = joint.GetBodyA();
      const bodyB = joint.GetBodyB();
      const localFrameA = joint.GetLocalFrameA();
      const localFrameB = joint.GetLocalFrameB();
      const worldA = bodyA.GetWorldPoint(localFrameA.p);
      const worldB = bodyB.GetWorldPoint(localFrameB.p);
      const a = lerpWorldPoint(bodyA, worldA, interp);
      const b = lerpWorldPoint(bodyB, worldB, interp);
      const sa = camera.toScreen(a.x, a.y, this.canvas);
      const sb = camera.toScreen(b.x, b.y, this.canvas);

      const jointType = joint.GetType();

      const jd = pw.getJointData(joint);

      // Skip hidden joints (e.g. jelly internal springs)
      if (jd?.hidden) return;

      // Check for rope stabilizer via joint userData
      if (jd?.ropeStabilizer) {
        const ddx = worldB.x - worldA.x;
        const ddy = worldB.y - worldA.y;
        const currentLen = Math.hypot(ddx, ddy);
        const restLen = (jd as { restLength?: number }).restLength ?? 0;
        const active = currentLen > restLen;
        ctx.strokeStyle = active ? "rgba(255,80,80,0.5)" : "rgba(80,200,80,0.3)";
        ctx.lineWidth = active ? 1.5 : 0.5;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
        return;
      }

      if (jointType.value === B2.b2JointType.b2_distanceJoint.value) {
        this.drawSpringCoil(sa, sb, camera.zoom);
      } else {
        ctx.strokeStyle = "rgba(150,200,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }

      const r = Math.max(0.1 * camera.zoom, 1);
      ctx.fillStyle = "rgba(150,200,255,0.6)";
      ctx.beginPath();
      ctx.arc(sa.x, sa.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, r, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  private drawSpringCoil(sa: { x: number; y: number }, sb: { x: number; y: number }, zoom: number) {
    const len = Math.hypot(sb.x - sa.x, sb.y - sa.y);
    if (len < 1) return;

    const points = computeSpringCoilPath(sa, sb, 12, Math.max(4, 0.15 * zoom));
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(200,220,255,0.7)";
    ctx.lineWidth = Math.max(1, 0.05 * zoom);
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  private drawParticles(camera: Camera) {
    const ctx = this.ctx;
    for (const p of this.particles.getParticles()) {
      const sp = camera.toScreen(p.x, p.y, this.canvas);
      const alpha = p.life / p.maxLife;
      const r = p.size * camera.zoom;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  private drawWater(water: WaterSystem, camera: Camera) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;

    // Determine visible world X range
    const leftWorld = (0 - cw / 2) / camera.zoom + camera.x;
    const rightWorld = (cw - cw / 2) / camera.zoom + camera.x;

    // Collect visible columns into contiguous runs
    const cols: { x: number; level: number; floor: number }[] = [];
    for (const col of water.visibleColumns(leftWorld, rightWorld)) {
      cols.push(col);
    }
    if (cols.length === 0) return;

    // Sort by x
    cols.sort((a, b) => a.x - b.x);

    // Draw filled water regions — group into contiguous runs
    const COL_WIDTH = 0.2;
    const GAP_THRESHOLD = COL_WIDTH * 2.5;

    let runStart = 0;
    for (let i = 0; i <= cols.length; i++) {
      const endRun = i === cols.length || (i > 0 && cols[i].x - cols[i - 1].x > GAP_THRESHOLD);
      if (endRun && i > runStart) {
        this.drawWaterRun(ctx, camera, cols, runStart, i);
        runStart = i;
      }
    }
  }

  private drawWaterRun(
    ctx: CanvasRenderingContext2D,
    camera: Camera,
    cols: { x: number; level: number; floor: number }[],
    start: number,
    end: number,
  ) {
    const halfCol = 0.1; // COL_WIDTH / 2

    // Draw water body (filled polygon)
    ctx.beginPath();

    // Top edge: left to right along water surface
    for (let i = start; i < end; i++) {
      const sl = camera.toScreen(cols[i].x - halfCol, cols[i].level, this.canvas);
      const sr = camera.toScreen(cols[i].x + halfCol, cols[i].level, this.canvas);
      if (i === start) ctx.moveTo(sl.x, sl.y);
      else ctx.lineTo(sl.x, sl.y);
      ctx.lineTo(sr.x, sr.y);
    }

    // Bottom edge: right to left along floor
    for (let i = end - 1; i >= start; i--) {
      const sr = camera.toScreen(cols[i].x + halfCol, cols[i].floor, this.canvas);
      const sl = camera.toScreen(cols[i].x - halfCol, cols[i].floor, this.canvas);
      ctx.lineTo(sr.x, sr.y);
      ctx.lineTo(sl.x, sl.y);
    }

    ctx.closePath();
    ctx.fillStyle = "rgba(30, 100, 200, 0.35)";
    ctx.fill();

    // Draw surface line
    ctx.beginPath();
    for (let i = start; i < end; i++) {
      const sl = camera.toScreen(cols[i].x - halfCol, cols[i].level, this.canvas);
      const sr = camera.toScreen(cols[i].x + halfCol, cols[i].level, this.canvas);
      if (i === start) ctx.moveTo(sl.x, sl.y);
      else ctx.lineTo(sl.x, sl.y);
      ctx.lineTo(sr.x, sr.y);
    }
    ctx.strokeStyle = "rgba(80, 160, 255, 0.7)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawOcean(camera: Camera) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const surface = camera.toScreen(0, KILL_Y, this.canvas);

    if (surface.y > ch) return;

    const top = Math.max(0, surface.y);

    ctx.fillStyle = "rgba(20, 60, 120, 0.4)";
    ctx.fillRect(0, top, cw, ch - top);

    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = oceanWave(wx);
      const sy = camera.toScreen(0, KILL_Y + wave, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = "rgba(30, 80, 160, 0.3)";
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = oceanWave(wx);
      const sy = camera.toScreen(0, KILL_Y + wave, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = "rgba(100, 180, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawSky(camera: Camera) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const surface = camera.toScreen(0, KILL_Y_TOP, this.canvas);

    if (surface.y < 0) return;

    const bottom = Math.min(this.canvas.clientHeight, surface.y);

    ctx.fillStyle = "rgba(40, 60, 120, 0.3)";
    ctx.fillRect(0, 0, cw, bottom);

    const gradH = 60;
    const grad = ctx.createLinearGradient(0, bottom - gradH, 0, bottom);
    grad.addColorStop(0, "rgba(80, 120, 200, 0)");
    grad.addColorStop(1, "rgba(80, 120, 200, 0.25)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, bottom - gradH, cw, gradH);

    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wisp = cloudWisp(wx);
      const sy = camera.toScreen(0, KILL_Y_TOP + wisp, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = "rgba(180, 200, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}
