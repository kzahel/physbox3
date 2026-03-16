import * as planck from "planck";
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
      const world = this.ctx.game.camera.toWorld(screenX, screenY, this.ctx.game.canvas);
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
    // Clean up any existing grab before starting a new one
    this.onUp();

    const radius = radiusPx / this.ctx.game.camera.zoom;
    const point = planck.Vec2(wx, wy);
    let target: planck.Body | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    this.ctx.game.world.queryAABB(
      planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
      (fixture) => {
        const body = fixture.getBody();
        if (fixture.testPoint(point)) {
          target = body;
          bestDist = 0;
          return false;
        }
        const d = planck.Vec2.lengthOf(planck.Vec2.sub(body.getPosition(), point));
        if (d < bestDist) {
          bestDist = d;
          target = body;
        }
        return true;
      },
    );

    if (target) {
      const t = target as planck.Body;
      if (t.isDynamic()) {
        this.mouseJoint = this.ctx.game.world.createJoint(
          planck.MouseJoint({ maxForce: 1000 * t.getMass() }, this.ctx.groundBody, t, point),
        ) as planck.MouseJoint;
      } else {
        this.grabbedStatic = t;
      }
    }
  }
}
