import type { Body } from "box2d3";
import { clamp } from "../../engine/Physics";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export class ScaleTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "drag" as const;
  /** Visible to Renderer for preview ring */
  scaleDrag: { body: Body; startScreenY: number; currentScale: number } | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number, _sx: number, sy: number) {
    const body = this.ctx.findBodyAt(wx, wy, 20);
    if (body) {
      this.scaleDrag = { body, startScreenY: sy, currentScale: 1 };
    }
  }

  onMove(_wx: number, _wy: number, _dx: number, _dy: number, _sx: number, sy: number) {
    if (this.scaleDrag) {
      const deltaY = this.scaleDrag.startScreenY - sy;
      this.scaleDrag.currentScale = clamp(2 ** (deltaY / 150), 0.2, 5);
    }
  }

  onUp() {
    if (!this.scaleDrag) return;
    const { body, currentScale } = this.scaleDrag;
    this.scaleDrag = null;
    if (Math.abs(currentScale - 1) < 0.05) return;
    this.ctx.game.scaleBody(body, currentScale);
  }

  reset() {
    this.scaleDrag = null;
  }
}
