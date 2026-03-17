import { distance } from "../../engine/Physics";
import { createPolygon } from "../../prefabs/Polygon";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export class DrawTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "drag" as const;
  /** Points collected while drawing — visible to Renderer for preview */
  drawPoints: { x: number; y: number }[] = [];
  private drawing = false;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    this.drawing = true;
    this.drawPoints = [{ x: wx, y: wy }];
  }

  onMove(wx: number, wy: number) {
    if (!this.drawing) return;
    // Add point, but skip if too close to last point (avoid duplicates)
    const last = this.drawPoints[this.drawPoints.length - 1];
    const dist = distance({ x: wx, y: wy }, last);
    if (dist > 0.05) {
      this.drawPoints.push({ x: wx, y: wy });
    }
  }

  onUp() {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.drawPoints.length >= 3) {
      createPolygon(this.ctx.game.pw, this.drawPoints);
    }
    this.drawPoints = [];
  }

  reset() {
    this.drawing = false;
    this.drawPoints = [];
  }
}
