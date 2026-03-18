import type { ToolContext, ToolHandler } from "../ToolHandler";

export class FluidParticleTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "brush" as const;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    this.spawn(wx, wy);
  }

  onBrush(wx: number, wy: number) {
    this.spawn(wx, wy);
  }

  private spawn(wx: number, wy: number) {
    this.ctx.game.spawnParticleBurst(wx, wy);
  }
}
