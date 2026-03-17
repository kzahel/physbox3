import type * as planck from "planck";
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
import { ParticleSystem } from "./ParticleSystem";

/** Button dimensions shared with SelectTool for hit detection */
export const BTN_HALF_WIDTH = 38;
export const BTN_HALF_HEIGHT = 9;
export const BTN_TOGGLE_OFFSET_Y = 30;
export const BTN_DIRECTION_OFFSET_Y = 55;
export const BTN_SPACING = 25;

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

export class Renderer implements IRenderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  readonly particles = new ParticleSystem();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  dispose() {
    // Nothing to clean up for Canvas 2D
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    // Use clientWidth/Height to match actual CSS layout size (100vw/100vh)
    // window.innerWidth/Height can differ on mobile due to browser chrome
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawWorld(world: planck.World, camera: Camera) {
    this.clear();
    const ctx = this.ctx;

    // Draw ocean at kill floor and sky at kill ceiling
    this.drawOcean(camera);
    this.drawSky(camera);

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const pos = body.getPosition();
      const angle = body.getAngle();

      for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
        const shape = fixture.getShape();
        const userData = fixture.getUserData() as FixtureStyle | null;
        const isSensor = fixture.isSensor();

        ctx.save();

        // Transform to screen space
        const screen = camera.toScreen(pos.x, pos.y, this.canvas);
        ctx.translate(screen.x, screen.y);
        ctx.rotate(-angle); // flip rotation for Y-flip
        ctx.scale(camera.zoom, -camera.zoom); // scale + flip Y

        // Style
        const fillColor = userData?.fill ?? this.bodyColor(body);
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
          // Spoke for rotation
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
    }

    // Draw joints
    this.drawJoints(world, camera);

    // Conveyor belt animation
    this.drawConveyorAnimation(world, camera);

    // Balloon strings
    this.drawBalloonStrings(world, camera);

    // Dynamite wick + sparks
    this.drawDynamiteEffects(world, camera);

    // Particles
    this.particles.tick();
    this.drawParticles(camera);

    // Draw tool cursor overlay
    if (this.inputManager?.toolCursor) {
      const tool = this.inputManager.tool;
      const pos = this.inputManager.toolCursor;
      if (tool !== "scale" || !this.inputManager?.scaleDrag) {
        const style = TOOL_CURSORS[tool];
        if (style) this.drawToolCursor(pos, style.radius, style.stroke, style.fill);
      }
    }

    // Draw platform/conveyor/fan preview
    if (this.inputManager?.platformDraw) {
      const tool = this.inputManager.tool;
      const isFan = tool === "fan";
      const isCannon = tool === "cannon";
      const isRocket = tool === "rocket";
      const isConveyor = tool === "conveyor";
      const { start, end } = this.inputManager.platformDraw;
      const s = camera.toScreen(start.x, start.y, this.canvas);
      const e = camera.toScreen(end.x, end.y, this.canvas);
      const ctx = this.ctx;
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
      // Endpoint dots
      ctx.fillStyle = color;
      for (const p of [s, e]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      // Fan/cannon: arrow at end to show direction
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

    // Draw rope pending highlight
    if (this.inputManager?.ropePending) {
      const rp = this.inputManager.ropePending;
      const sp = rp.body
        ? camera.toScreen(rp.body.getPosition().x, rp.body.getPosition().y, this.canvas)
        : camera.toScreen(rp.x, rp.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(180, 160, 120, 0.9)", "rgba(180, 160, 120, 0.15)");
    }

    // Draw attach pending highlight
    if (this.inputManager?.attachPending) {
      const body = this.inputManager.attachPending.body;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(255, 200, 50, 0.9)", "rgba(255, 200, 50, 0.15)");
    }

    // Draw scale preview
    if (this.inputManager?.scaleDrag) {
      const sd = this.inputManager.scaleDrag;
      const bpos = sd.body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      const ringSize = 20 * sd.currentScale;
      this.drawToolCursor(sp, ringSize, "rgba(180, 120, 255, 0.8)", "rgba(180, 120, 255, 0.1)");
      this.inScreenSpace(() => {
        this.ctx.fillStyle = "#fff";
        this.ctx.font = "bold 13px system-ui, sans-serif";
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.fillText(`${sd.currentScale.toFixed(1)}x`, sp.x, sp.y - ringSize - 14);
      });
    }

    // Draw select tool UI
    if (this.inputManager?.selectedBody) {
      const body = this.inputManager.selectedBody;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      // Selection highlight ring
      this.drawToolCursor(sp, 20, "rgba(100, 200, 255, 0.8)", "rgba(100, 200, 255, 0.08)");
      // Toggle button above body
      this.drawToggleButton(sp, body.isStatic());
      // Direction button for cars/conveyors
      let nextBtnY = BTN_DIRECTION_OFFSET_Y;
      if (isDirectional(body)) {
        this.drawDirectionButton(sp, nextBtnY);
        nextBtnY += BTN_SPACING;
      }
      // Motor button
      this.drawMotorButton(sp, nextBtnY, hasMotor(body));
    }
  }

  setInputManager(input: InputManager) {
    this.inputManager = input;
  }

  private inputManager: InputManager | null = null;

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

  private drawToolCursor(pos: { x: number; y: number }, radius: number, stroke: string, fill: string) {
    this.inScreenSpace(() => {
      this.ctx.beginPath();
      this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      this.ctx.strokeStyle = stroke;
      this.ctx.lineWidth = 2;
      this.ctx.setLineDash([6, 4]);
      this.ctx.stroke();
      this.ctx.fillStyle = fill;
      this.ctx.fill();
      this.ctx.setLineDash([]);
    });
  }

  private drawPillButton(x: number, y: number, label: string, bg: string) {
    this.inScreenSpace(() => {
      const ctx = this.ctx;
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
    });
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

  private drawOcean(camera: Camera) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const surface = camera.toScreen(0, KILL_Y, this.canvas);

    // Only draw if ocean surface is visible
    if (surface.y > ch) return;

    const top = Math.max(0, surface.y);

    // Water body
    ctx.fillStyle = "rgba(20, 60, 120, 0.4)";
    ctx.fillRect(0, top, cw, ch - top);

    // Surface line with wave effect
    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = Math.sin(wx * 0.8) * 2 + Math.sin(wx * 1.5) * 1;
      const sy = camera.toScreen(0, KILL_Y + wave, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = "rgba(30, 80, 160, 0.3)";
    ctx.fill();

    // Surface highlight
    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = Math.sin(wx * 0.8) * 2 + Math.sin(wx * 1.5) * 1;
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

    // Only draw if sky boundary is visible (screen Y is inverted: sky is at top)
    if (surface.y < 0) return;

    const bottom = Math.min(this.canvas.clientHeight, surface.y);

    // Sky fill above the boundary
    ctx.fillStyle = "rgba(40, 60, 120, 0.3)";
    ctx.fillRect(0, 0, cw, bottom);

    // Gradient fade near the boundary line
    const gradH = 60;
    const grad = ctx.createLinearGradient(0, bottom - gradH, 0, bottom);
    grad.addColorStop(0, "rgba(80, 120, 200, 0)");
    grad.addColorStop(1, "rgba(80, 120, 200, 0.25)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, bottom - gradH, cw, gradH);

    // Boundary line with wispy cloud effect
    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wisp = Math.sin(wx * 0.5) * 3 + Math.sin(wx * 1.2) * 1.5;
      const sy = camera.toScreen(0, KILL_Y_TOP + wisp, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = "rgba(180, 200, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawConveyorAnimation(world: planck.World, camera: Camera) {
    const ctx = this.ctx;
    const time = performance.now() / 1000;

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; speed?: number } | null;
      if (ud?.label !== "conveyor") continue;

      const speed = ud.speed ?? 3;
      const pos = body.getPosition();
      const angle = body.getAngle();

      // Get conveyor half-width from first fixture
      const fixture = body.getFixtureList();
      if (!fixture) continue;
      const shape = fixture.getShape() as planck.PolygonShape;
      const hw = Math.abs(shape.m_vertices[0].x); // half-width

      ctx.save();
      const screen = camera.toScreen(pos.x, pos.y, this.canvas);
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-angle);

      // Animated chevrons along the belt surface
      const spacing = 0.8; // world units between chevrons
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
        // Draw chevron pointing in speed direction
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
    const ctx = this.ctx;
    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; fill?: string } | null;
      if (ud?.label !== "balloon") continue;

      const pos = body.getPosition();
      const angle = body.getAngle();

      // Get radius from first fixture
      const fixture = body.getFixtureList();
      if (!fixture) continue;
      const shape = fixture.getShape() as planck.CircleShape;
      const radius = shape.getRadius();

      // String hangs from bottom of balloon, with a slight wave
      const bottomX = pos.x - Math.sin(angle) * radius;
      const bottomY = pos.y - Math.cos(angle) * radius;
      const stringLen = radius * 3;
      const sp = camera.toScreen(bottomX, bottomY, this.canvas);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      // Wavy string using quadratic curves
      const segments = 3;
      const segLen = (stringLen * camera.zoom) / segments;
      for (let i = 0; i < segments; i++) {
        const wobble = (i % 2 === 0 ? 1 : -1) * 4;
        ctx.quadraticCurveTo(sp.x + wobble, sp.y + segLen * (i + 0.5), sp.x, sp.y + segLen * (i + 1));
      }
      ctx.strokeStyle = ud.fill ?? "rgba(200,200,200,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Highlight / shine on the balloon
      const center = camera.toScreen(pos.x, pos.y, this.canvas);
      const shineR = radius * camera.zoom * 0.3;
      ctx.beginPath();
      ctx.arc(center.x - shineR, center.y - shineR, shineR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();
      ctx.restore();
    }
  }

  private drawDynamiteEffects(world: planck.World, camera: Camera) {
    const now = performance.now();
    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; fuseStart?: number; fuseDuration?: number } | null;
      if (ud?.label !== "dynamite" || !ud.fuseStart || !ud.fuseDuration) continue;

      const elapsed = (now - ud.fuseStart) / 1000;
      const remaining = Math.max(0, 1 - elapsed / ud.fuseDuration);

      const pos = body.getPosition();
      const angle = body.getAngle();
      const ctx = this.ctx;

      // Wick: starts at top of dynamite, shrinks
      const wickBaseX = pos.x + Math.sin(-angle) * 0.4;
      const wickBaseY = pos.y + Math.cos(-angle) * 0.4;
      const wickLen = 0.5 * remaining;
      const wickEndX = wickBaseX + Math.sin(-angle) * wickLen;
      const wickEndY = wickBaseY + Math.cos(-angle) * wickLen;

      const wbSp = camera.toScreen(wickBaseX, wickBaseY, this.canvas);
      const weSp = camera.toScreen(wickEndX, wickEndY, this.canvas);

      ctx.beginPath();
      ctx.moveTo(wbSp.x, wbSp.y);
      ctx.lineTo(weSp.x, weSp.y);
      ctx.strokeStyle = "rgba(80,60,40,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spark at wick tip
      if (remaining > 0) {
        this.particles.spawnSpark(wickEndX, wickEndY);
        // Glow at tip
        ctx.beginPath();
        ctx.arc(weSp.x, weSp.y, 4 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 100)},50,${0.5 + Math.random() * 0.3})`;
        ctx.fill();
      }
    }
  }

  private drawToggleButton(bodyScreen: { x: number; y: number }, isStatic: boolean) {
    this.drawPillButton(
      bodyScreen.x,
      bodyScreen.y - BTN_TOGGLE_OFFSET_Y,
      isStatic ? "Fixed" : "Free",
      isStatic ? "rgba(200, 80, 80, 0.85)" : "rgba(80, 160, 80, 0.85)",
    );
  }

  private drawJoints(world: planck.World, camera: Camera) {
    const ctx = this.ctx;

    for (let joint = world.getJointList(); joint; joint = joint.getNext()) {
      const a = joint.getAnchorA();
      const b = joint.getAnchorB();
      const sa = camera.toScreen(a.x, a.y, this.canvas);
      const sb = camera.toScreen(b.x, b.y, this.canvas);

      if (joint.getType() === "distance-joint") {
        this.drawSpringCoil(sa, sb, camera.zoom);
      } else {
        ctx.strokeStyle = "rgba(150,200,255,0.4)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
        ctx.stroke();
      }

      // Anchor dots (scale with zoom, 0.1m world radius)
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
    const amplitude = Math.max(4, 0.15 * zoom); // screen pixels
    const nx = -dy / len; // normal perpendicular to spring axis
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

  /** Reset transform to CSS-pixel identity for screen-space drawing */
  private inScreenSpace(fn: () => void) {
    this.ctx.save();
    const dpr = window.devicePixelRatio || 1;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fn();
    this.ctx.restore();
  }

  private bodyColor(body: planck.Body): string {
    if (body.isStatic()) return "rgba(80,80,100,0.8)";
    if (body.isKinematic()) return "rgba(100,180,100,0.6)";
    const ud = body.getUserData() as BodyStyle | null;
    return ud?.fill ?? "rgba(120,160,255,0.6)";
  }
}

export interface FixtureStyle {
  fill?: string;
  stroke?: string;
}

export interface BodyStyle {
  fill?: string;
  label?: string;
}
