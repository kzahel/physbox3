import * as planck from "planck";
import { findClosestBody } from "../../engine/Physics";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export const GRAB_RADIUS_PX = 30;

export class GrabTool implements ToolHandler {
  private mouseJoint: planck.MouseJoint | null = null;
  private grabbedStatic: planck.Body | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number, _sx: number, _sy: number) {
    this.startGrab(wx, wy, GRAB_RADIUS_PX);
  }

  onMove(_wx: number, _wy: number, dx: number, dy: number, screenX: number, screenY: number) {
    if (this.mouseJoint) {
      const world = this.ctx.game.camera.toWorld(screenX, screenY, this.ctx.game.container);
      this.mouseJoint.setTarget(planck.Vec2(world.x, world.y));
    } else if (this.grabbedStatic) {
      const wdx = dx / this.ctx.game.camera.zoom;
      const wdy = -dy / this.ctx.game.camera.zoom;
      const pos = this.grabbedStatic.getPosition();
      this.grabbedStatic.setPosition(planck.Vec2(pos.x + wdx, pos.y + wdy));
    }
  }

  onUp() {
    if (this.mouseJoint) {
      this.ctx.game.world.destroyJoint(this.mouseJoint);
      this.mouseJoint = null;
    }
    this.grabbedStatic = null;
  }

  reset() {
    this.onUp();
  }

  /** Release grab — called when a second finger enters (pan gesture) */
  releaseGrab() {
    this.onUp();
  }

  private startGrab(wx: number, wy: number, radiusPx = 5) {
    this.onUp();

    const radius = radiusPx / this.ctx.game.camera.zoom;
    const target = findClosestBody(this.ctx.game.world, wx, wy, radius);

    if (target) {
      const point = planck.Vec2(wx, wy);
      if (target.isDynamic()) {
        this.mouseJoint = this.ctx.game.world.createJoint(
          planck.MouseJoint({ maxForce: 1000 * target.getMass() }, this.ctx.groundBody, target, point),
        ) as planck.MouseJoint;
      } else {
        this.grabbedStatic = target;
      }
    }
  }
}
