import type * as planck from "planck";
import { queryBodiesInRadius } from "../../engine/Physics";
import type { ToolContext, ToolHandler } from "../ToolHandler";

/**
 * Base class for brush-style tools that query bodies in a screen-pixel radius
 * and perform an action on them. Handles onDown/onBrush dispatch and the
 * screen-to-world AABB query boilerplate.
 */
export abstract class BrushTool implements ToolHandler {
  protected ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  /** Screen-pixel radius of the brush */
  abstract readonly radiusPx: number;

  /** Called with the unique bodies found within the brush radius */
  protected abstract brushAction(bodies: planck.Body[], worldX: number, worldY: number): void;

  onDown(_wx: number, _wy: number, sx: number, sy: number) {
    this.brush(sx, sy);
  }

  onBrush(_wx: number, _wy: number, sx: number, sy: number) {
    this.brush(sx, sy);
  }

  private brush(sx: number, sy: number) {
    const r = this.radiusPx / this.ctx.game.camera.zoom;
    const world = this.ctx.game.camera.toWorld(sx, sy, this.ctx.game.container);
    const bodies = queryBodiesInRadius(this.ctx.game.world, world.x, world.y, r, this.ctx.groundBody);
    this.brushAction(bodies, world.x, world.y);
  }
}
