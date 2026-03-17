import type * as planck from "planck";
import type { ToolRenderInfo } from "../interaction/ToolHandler";
import type { FixtureStyle } from "./BodyUserData";
import type { Camera } from "./Camera";
import { KILL_Y, KILL_Y_TOP } from "./Game";
import type { IRenderer } from "./IRenderer";
import { bodyColor, OverlayRenderer } from "./OverlayRenderer";
import { ParticleSystem } from "./ParticleSystem";
import { forEachBody } from "./Physics";
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

  drawWorld(world: planck.World, camera: Camera, water?: WaterSystem) {
    this.clear();
    this.drawOcean(camera);
    this.drawSky(camera);
    this.drawBodies(world, camera);
    this.drawJoints(world, camera);
    if (water) this.drawWater(water, camera);
    this.particles.tick();
    this.drawParticles(camera);
    this.overlay.drawOverlays(world, camera);
  }

  setInputManager(input: ToolRenderInfo) {
    this.overlay.setToolInfo(input);
  }

  private drawBodies(world: planck.World, camera: Camera) {
    const ctx = this.ctx;

    forEachBody(world, (body) => {
      const pos = body.getPosition();
      const angle = body.getAngle();

      for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
        const shape = fixture.getShape();
        const userData = fixture.getUserData() as FixtureStyle | null;
        const isSensor = fixture.isSensor();

        ctx.save();

        const screen = camera.toScreen(pos.x, pos.y, this.canvas);
        ctx.translate(screen.x, screen.y);
        ctx.rotate(-angle);
        ctx.scale(camera.zoom, -camera.zoom);

        const fillColor = userData?.fill ?? bodyColor(body);
        const strokeColor = userData?.stroke ?? "rgba(255,255,255,0.3)";
        ctx.fillStyle = isSensor ? "rgba(100,200,255,0.15)" : fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1 / camera.zoom;

        if (shape.getType() === "circle") {
          const circle = shape as planck.CircleShape;
          const r = circle.getRadius();
          const center = circle.getCenter();
          ctx.beginPath();
          ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(center.x + r, center.y);
          ctx.stroke();
        } else if (shape.getType() === "polygon") {
          const poly = shape as planck.PolygonShape;
          const verts = poly.m_vertices;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (shape.getType() === "edge") {
          const edge = shape as planck.EdgeShape;
          ctx.beginPath();
          ctx.moveTo(edge.m_vertex1.x, edge.m_vertex1.y);
          ctx.lineTo(edge.m_vertex2.x, edge.m_vertex2.y);
          ctx.stroke();
        } else if (shape.getType() === "chain") {
          const chain = shape as planck.ChainShape;
          const verts = chain.m_vertices;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.stroke();
        }

        ctx.restore();
      }
    });
  }

  private drawJoints(world: planck.World, camera: Camera) {
    const ctx = this.ctx;

    for (let joint = world.getJointList(); joint; joint = joint.getNext()) {
      const a = joint.getAnchorA();
      const b = joint.getAnchorB();
      const sa = camera.toScreen(a.x, a.y, this.canvas);
      const sb = camera.toScreen(b.x, b.y, this.canvas);

      if (joint.getType() === "rope-joint") {
        const ud = joint.getUserData() as { ropeStabilizer?: boolean } | null;
        if (ud?.ropeStabilizer) {
          ctx.strokeStyle = "rgba(200,180,120,0.3)";
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.moveTo(sa.x, sa.y);
          ctx.lineTo(sb.x, sb.y);
          ctx.stroke();
        }
        continue;
      } else if (joint.getType() === "distance-joint") {
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
    }
  }

  private drawSpringCoil(sa: { x: number; y: number }, sb: { x: number; y: number }, zoom: number) {
    const ctx = this.ctx;
    const dx = sb.x - sa.x;
    const dy = sb.y - sa.y;
    const len = Math.hypot(dx, dy);
    if (len < 1) return;

    const coils = 12;
    const amplitude = Math.max(4, 0.15 * zoom);
    const nx = -dy / len;
    const ny = dx / len;

    ctx.strokeStyle = "rgba(200,220,255,0.7)";
    ctx.lineWidth = Math.max(1, 0.05 * zoom);
    ctx.beginPath();
    ctx.moveTo(sa.x, sa.y);

    for (let i = 1; i <= coils * 2; i++) {
      const t = i / (coils * 2 + 1);
      const x = sa.x + dx * t;
      const y = sa.y + dy * t;
      const side = i % 2 === 1 ? 1 : -1;
      ctx.lineTo(x + nx * amplitude * side, y + ny * amplitude * side);
    }

    const tEnd = (coils * 2 + 1) / (coils * 2 + 1);
    ctx.lineTo(sa.x + dx * tEnd, sa.y + dy * tEnd);
    ctx.lineTo(sb.x, sb.y);
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
