import type * as planck from "planck";
import { BTN_HALF_HEIGHT, BTN_HALF_WIDTH, getSelectionButtons, hasMotor } from "../interaction/SelectionButtons";
import type { Tool, ToolRenderInfo } from "../interaction/ToolHandler";
import { ERASE_RADIUS_PX } from "../interaction/tools/EraseTool";
import { GLUE_RADIUS_PX } from "../interaction/tools/GlueTool";
import { GRAB_RADIUS_PX } from "../interaction/tools/GrabTool";
import { getBodyUserData } from "./BodyUserData";
import type { Camera } from "./Camera";
import { convexHull } from "./ConvexHull";
import { type Interpolation, lerpBody, NO_INTERP } from "./Interpolation";
import type { IParticleSystem } from "./IRenderer";
import { drawBalloonStrings, drawConveyorAnimation, drawDynamiteEffects } from "./PrefabOverlays";

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
  drawOverlays(world: planck.World, camera: Camera, interp: Interpolation = NO_INTERP) {
    drawConveyorAnimation(this.ctx, this.canvas, world, camera, interp);
    drawBalloonStrings(this.ctx, this.canvas, world, camera, interp);
    drawDynamiteEffects(this.ctx, this.canvas, world, camera, this.particles, interp);
    this.drawToolOverlays(camera, interp);
    this.drawSelectionUI(camera, interp);
  }

  // ── Tool overlays ──

  private drawToolOverlays(camera: Camera, interp: Interpolation) {
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
      let sp: { x: number; y: number };
      if (rp.body) {
        const { x, y } = lerpBody(rp.body, interp);
        sp = camera.toScreen(x, y, this.canvas);
      } else {
        sp = camera.toScreen(rp.x, rp.y, this.canvas);
      }
      this.drawToolCursor(sp, 16, "rgba(180, 160, 120, 0.9)", "rgba(180, 160, 120, 0.15)");
    }

    if (this.toolInfo?.attachPending) {
      const body = this.toolInfo.attachPending.body;
      const { x, y } = lerpBody(body, interp);
      const sp = camera.toScreen(x, y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(255, 200, 50, 0.9)", "rgba(255, 200, 50, 0.15)");
    }

    if (this.toolInfo?.scaleDrag) {
      const sd = this.toolInfo.scaleDrag;
      const { x, y } = lerpBody(sd.body, interp);
      const sp = camera.toScreen(x, y, this.canvas);
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

  private drawSelectionUI(camera: Camera, interp: Interpolation) {
    if (!this.toolInfo?.selectedBody) return;
    const body = this.toolInfo.selectedBody;
    const { x, y } = lerpBody(body, interp);
    const sp = camera.toScreen(x, y, this.canvas);
    this.drawToolCursor(sp, 20, "rgba(100, 200, 255, 0.8)", "rgba(100, 200, 255, 0.08)");
    for (const btn of getSelectionButtons(body)) {
      switch (btn.id) {
        case "toggle":
          this.drawToggleButton(sp, btn.offsetY, body.isStatic());
          break;
        case "direction":
          this.drawDirectionButton(sp, btn.offsetY);
          break;
        case "motor":
          this.drawMotorButton(sp, btn.offsetY, hasMotor(body));
          break;
      }
    }
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
      const hull = convexHull(pts);
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

  private drawToggleButton(bodyScreen: { x: number; y: number }, offsetY: number, isStatic: boolean) {
    this.drawPillButton(
      bodyScreen.x,
      bodyScreen.y - offsetY,
      isStatic ? "Fixed" : "Free",
      isStatic ? "rgba(200, 80, 80, 0.85)" : "rgba(80, 160, 80, 0.85)",
    );
  }

  private drawDirectionButton(bodyScreen: { x: number; y: number }, offsetY: number) {
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
