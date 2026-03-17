import type * as planck from "planck";
import type { Tool, ToolRenderInfo } from "../interaction/ToolHandler";
import { ERASE_RADIUS_PX } from "../interaction/tools/EraseTool";
import { GLUE_RADIUS_PX } from "../interaction/tools/GlueTool";
import { GRAB_RADIUS_PX } from "../interaction/tools/GrabTool";
import { hasMotor, isDirectional } from "../interaction/tools/SelectTool";
import { getBodyUserData, isBalloon, isConveyor, isDynamite } from "./BodyUserData";
import type { Camera } from "./Camera";
import type { IParticleSystem } from "./IRenderer";
import { forEachBody } from "./Physics";

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
  draw: { radius: 6, stroke: "rgba(120, 200, 160, 0.7)", fill: "rgba(120, 200, 160, 0.1)" },
};

// Conveyor animation
const CONVEYOR_SPACING = 0.8;
const CONVEYOR_CHEVRON_SCALE = 0.15;

// Balloon string rendering
const BALLOON_STRING_LENGTH_FACTOR = 3;
const BALLOON_STRING_SEGMENTS = 3;
const BALLOON_STRING_WOBBLE = 4;
const BALLOON_SHINE_SCALE = 0.3;

// Dynamite wick rendering
const WICK_BASE_OFFSET = 0.4;
const WICK_MAX_LENGTH = 0.5;
const WICK_GLOW_MIN_RADIUS = 4;
const WICK_GLOW_RADIUS_JITTER = 3;

const PLATFORM_PREVIEW_COLORS: Partial<Record<Tool, string>> = {
  fan: "rgba(120, 180, 220, 0.9)",
  cannon: "rgba(180, 80, 80, 0.9)",
  rocket: "rgba(200, 200, 220, 0.9)",
  conveyor: "rgba(200, 160, 50, 0.9)",
  platform: "rgba(80, 100, 80, 0.9)",
};

export function bodyColor(body: planck.Body): string {
  if (body.isStatic()) return "rgba(80,80,100,0.8)";
  if (body.isKinematic()) return "rgba(100,180,100,0.6)";
  const ud = getBodyUserData(body);
  return ud?.fill ?? "rgba(120,160,255,0.6)";
}

/**
 * Handles all 2D canvas overlay drawing shared between Canvas and WebGL renderers:
 * tool cursors, buttons, previews, conveyor animation, balloon strings, dynamite effects.
 */
export class OverlayRenderer {
  private toolInfo: ToolRenderInfo | null = null;
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private particles: IParticleSystem;

  constructor(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, particles: IParticleSystem) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.particles = particles;
  }

  setToolInfo(info: ToolRenderInfo) {
    this.toolInfo = info;
  }

  /** Draw all 2D overlays. Call after the main scene is rendered. */
  drawOverlays(world: planck.World, camera: Camera) {
    this.drawConveyorAnimation(world, camera);
    this.drawBalloonStrings(world, camera);
    this.drawDynamiteEffects(world, camera);
    this.drawToolOverlays(camera);
    this.drawSelectionUI(camera);
  }

  // ── Tool overlays ──

  private drawToolOverlays(camera: Camera) {
    if (this.toolInfo?.toolCursor) {
      const tool = this.toolInfo.tool;
      const pos = this.toolInfo.toolCursor;
      if (tool !== "scale" || !this.toolInfo?.scaleDrag) {
        const style = TOOL_CURSORS[tool];
        if (style) this.drawToolCursor(pos, style.radius, style.stroke, style.fill);
      }
    }

    if (this.toolInfo?.platformDraw) {
      this.drawPlatformPreview(camera);
    }

    if (this.toolInfo?.tool === "draw") {
      const pts = this.toolInfo.drawPoints;
      if (pts.length >= 1) {
        this.drawDrawPreview(pts, camera);
      }
    }

    if (this.toolInfo?.ropePending) {
      const rp = this.toolInfo.ropePending;
      const sp = rp.body
        ? camera.toScreen(rp.body.getPosition().x, rp.body.getPosition().y, this.canvas)
        : camera.toScreen(rp.x, rp.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(180, 160, 120, 0.9)", "rgba(180, 160, 120, 0.15)");
    }

    if (this.toolInfo?.attachPending) {
      const body = this.toolInfo.attachPending.body;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(255, 200, 50, 0.9)", "rgba(255, 200, 50, 0.15)");
    }

    if (this.toolInfo?.scaleDrag) {
      const sd = this.toolInfo.scaleDrag;
      const bpos = sd.body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      const ringSize = 20 * sd.currentScale;
      this.drawToolCursor(sp, ringSize, "rgba(180, 120, 255, 0.8)", "rgba(180, 120, 255, 0.1)");
      this.ctx.fillStyle = "#fff";
      this.ctx.font = "bold 13px system-ui, sans-serif";
      this.ctx.textAlign = "center";
      this.ctx.textBaseline = "middle";
      this.ctx.fillText(`${sd.currentScale.toFixed(1)}x`, sp.x, sp.y - ringSize - 14);
    }
  }

  private drawPlatformPreview(camera: Camera) {
    const tool = this.toolInfo!.tool;
    const { start, end } = this.toolInfo!.platformDraw!;
    const s = camera.toScreen(start.x, start.y, this.canvas);
    const e = camera.toScreen(end.x, end.y, this.canvas);
    const color = PLATFORM_PREVIEW_COLORS[tool] ?? "rgba(80, 100, 80, 0.9)";
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(e.x, e.y);
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
    if (tool === "fan" || tool === "cannon" || tool === "rocket") {
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

  // ── Selection UI ──

  private drawSelectionUI(camera: Camera) {
    if (!this.toolInfo?.selectedBody) return;
    const body = this.toolInfo.selectedBody;
    const bpos = body.getPosition();
    const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
    this.drawToolCursor(sp, 20, "rgba(100, 200, 255, 0.8)", "rgba(100, 200, 255, 0.08)");
    this.drawToggleButton(sp, body.isStatic());
    let nextBtnY = BTN_DIRECTION_OFFSET_Y;
    if (isDirectional(body)) {
      this.drawDirectionButton(sp, nextBtnY);
      nextBtnY += BTN_SPACING;
    }
    this.drawMotorButton(sp, nextBtnY, hasMotor(body));
  }

  // ── Body-specific effects ──

  private drawConveyorAnimation(world: planck.World, camera: Camera) {
    const ctx = this.ctx;
    const time = performance.now() / 1000;

    forEachBody(world, (body) => {
      const ud = getBodyUserData(body);
      if (!isConveyor(ud)) return;

      const speed = ud.speed;
      const pos = body.getPosition();
      const angle = body.getAngle();
      const fixture = body.getFixtureList();
      if (!fixture) return;
      const shape = fixture.getShape() as planck.PolygonShape;
      const hw = Math.abs(shape.m_vertices[0].x);

      ctx.save();
      const screen = camera.toScreen(pos.x, pos.y, this.canvas);
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-angle);

      const offset = (time * speed) % CONVEYOR_SPACING;
      const count = Math.ceil((hw * 2) / CONVEYOR_SPACING) + 1;
      const chevronSize = CONVEYOR_CHEVRON_SCALE * camera.zoom;

      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = Math.max(1, 0.06 * camera.zoom);
      ctx.lineCap = "round";

      for (let i = 0; i < count; i++) {
        const lx = (-hw + offset + i * CONVEYOR_SPACING) * camera.zoom;
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
    });
  }

  private drawBalloonStrings(world: planck.World, camera: Camera) {
    const ctx = this.ctx;
    forEachBody(world, (body) => {
      const ud = getBodyUserData(body);
      if (!isBalloon(ud)) return;

      const pos = body.getPosition();
      const angle = body.getAngle();
      const fixture = body.getFixtureList();
      if (!fixture) return;
      const shape = fixture.getShape() as planck.CircleShape;
      const radius = shape.getRadius();

      const bottomX = pos.x - Math.sin(angle) * radius;
      const bottomY = pos.y - Math.cos(angle) * radius;
      const stringLen = radius * BALLOON_STRING_LENGTH_FACTOR;
      const sp = camera.toScreen(bottomX, bottomY, this.canvas);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      const segLen = (stringLen * camera.zoom) / BALLOON_STRING_SEGMENTS;
      for (let i = 0; i < BALLOON_STRING_SEGMENTS; i++) {
        const wobble = (i % 2 === 0 ? 1 : -1) * BALLOON_STRING_WOBBLE;
        ctx.quadraticCurveTo(sp.x + wobble, sp.y + segLen * (i + 0.5), sp.x, sp.y + segLen * (i + 1));
      }
      ctx.strokeStyle = ud.fill ?? "rgba(200,200,200,0.6)";
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // Highlight / shine on the balloon
      const center = camera.toScreen(pos.x, pos.y, this.canvas);
      const shineR = radius * camera.zoom * BALLOON_SHINE_SCALE;
      ctx.beginPath();
      ctx.arc(center.x - shineR, center.y - shineR, shineR, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255,255,255,0.25)";
      ctx.fill();
      ctx.restore();
    });
  }

  private drawDynamiteEffects(world: planck.World, camera: Camera) {
    forEachBody(world, (body) => {
      const ud = getBodyUserData(body);
      if (!isDynamite(ud)) return;

      const remaining = Math.max(0, ud.fuseRemaining / ud.fuseDuration);

      const pos = body.getPosition();
      const angle = body.getAngle();
      const ctx = this.ctx;

      const wickBaseX = pos.x + Math.sin(-angle) * WICK_BASE_OFFSET;
      const wickBaseY = pos.y + Math.cos(-angle) * WICK_BASE_OFFSET;
      const wickLen = WICK_MAX_LENGTH * remaining;
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

      if (remaining > 0) {
        this.particles.spawnSpark(wickEndX, wickEndY);
        ctx.beginPath();
        ctx.arc(weSp.x, weSp.y, WICK_GLOW_MIN_RADIUS + Math.random() * WICK_GLOW_RADIUS_JITTER, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 100)},50,${0.5 + Math.random() * 0.3})`;
        ctx.fill();
      }
    });
  }

  // ── Draw tool preview ──

  private drawDrawPreview(pts: readonly { x: number; y: number }[], camera: Camera) {
    const ctx = this.ctx;
    const screenPts = pts.map((p) => camera.toScreen(p.x, p.y, this.canvas));

    ctx.save();

    ctx.fillStyle = "rgba(120, 200, 160, 0.9)";
    ctx.beginPath();
    ctx.arc(screenPts[0].x, screenPts[0].y, 5, 0, Math.PI * 2);
    ctx.fill();

    if (screenPts.length >= 2) {
      ctx.beginPath();
      ctx.moveTo(screenPts[0].x, screenPts[0].y);
      for (let i = 1; i < screenPts.length; i++) {
        ctx.lineTo(screenPts[i].x, screenPts[i].y);
      }
      ctx.strokeStyle = "rgba(120, 200, 160, 0.7)";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
    }

    if (pts.length >= 3) {
      const hull = this.computeHullPreview(pts);
      if (hull.length >= 3) {
        const hullScreen = hull.map((p) => camera.toScreen(p.x, p.y, this.canvas));
        ctx.beginPath();
        ctx.moveTo(hullScreen[0].x, hullScreen[0].y);
        for (let i = 1; i < hullScreen.length; i++) {
          ctx.lineTo(hullScreen[i].x, hullScreen[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(120, 200, 160, 0.2)";
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 200, 160, 0.9)";
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    ctx.restore();
  }

  private computeHullPreview(pts: readonly { x: number; y: number }[]): { x: number; y: number }[] {
    const sorted = pts.slice().sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    const lower: { x: number; y: number }[] = [];
    for (const p of sorted) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper: { x: number; y: number }[] = [];
    for (let i = sorted.length - 1; i >= 0; i--) {
      const p = sorted[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  // ── Primitive drawing helpers ──

  private drawToolCursor(pos: { x: number; y: number }, radius: number, stroke: string, fill: string) {
    this.ctx.beginPath();
    this.ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    this.ctx.strokeStyle = stroke;
    this.ctx.lineWidth = 2;
    this.ctx.setLineDash([6, 4]);
    this.ctx.stroke();
    this.ctx.fillStyle = fill;
    this.ctx.fill();
    this.ctx.setLineDash([]);
  }

  private drawPillButton(x: number, y: number, label: string, bg: string) {
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
}
