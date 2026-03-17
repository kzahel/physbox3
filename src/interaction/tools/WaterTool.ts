import type { ToolContext, ToolHandler } from "../ToolHandler";

const WATER_RADIUS_PX = 20;
/** Volume of water added per brush stroke tick */
const PAINT_VOLUME = 0.15;
/** Volume removed per erase tick */
const ERASE_VOLUME = 0.3;

export class WaterTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "brush" as const;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(_wx: number, _wy: number, sx: number, sy: number) {
    this.paint(sx, sy);
  }

  onBrush(_wx: number, _wy: number, sx: number, sy: number) {
    this.paint(sx, sy);
  }

  private paint(sx: number, sy: number) {
    const world = this.ctx.game.camera.toWorld(sx, sy, this.ctx.game.container);
    const water = this.ctx.game.water;
    const r = WATER_RADIUS_PX / this.ctx.game.camera.zoom;

    // Paint water in a few columns around the cursor
    const steps = Math.max(1, Math.ceil(r / 0.2));
    for (let i = -steps; i <= steps; i++) {
      const wx = world.x + (i / steps) * r;
      // Distribute volume across columns, more in center
      const dist = Math.abs(i / steps);
      const falloff = 1 - dist * dist;
      water.addWater(wx, world.y, PAINT_VOLUME * falloff * 0.3);
    }
  }
}

export class WaterEraseTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "brush" as const;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(_wx: number, _wy: number, sx: number, sy: number) {
    this.erase(sx, sy);
  }

  onBrush(_wx: number, _wy: number, sx: number, sy: number) {
    this.erase(sx, sy);
  }

  private erase(sx: number, sy: number) {
    const world = this.ctx.game.camera.toWorld(sx, sy, this.ctx.game.container);
    const r = WATER_RADIUS_PX / this.ctx.game.camera.zoom;
    this.ctx.game.water.removeWater(world.x, world.y, r, ERASE_VOLUME);
  }
}
