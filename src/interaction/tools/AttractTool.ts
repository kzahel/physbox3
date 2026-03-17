import type { Body } from "box2d3";
import { b2 } from "../../engine/Box2D";
import { createWeldJoint, isDynamic } from "../../engine/Physics";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export class AttractTool implements ToolHandler {
  /** Visible externally — two bodies being pulled together */
  attracting: { bodyA: Body; bodyB: Body } | null = null;
  private pending: { body: Body; world: { x: number; y: number } } | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    if (this.attracting) {
      this.attracting = null;
      return;
    }

    const body = this.ctx.findBodyAt(wx, wy);
    if (!body) return;

    if (!this.pending) {
      this.pending = { body, world: { x: wx, y: wy } };
    } else {
      if (body !== this.pending.body) {
        this.attracting = { bodyA: this.pending.body, bodyB: body };
      }
      this.pending = null;
    }
  }

  reset() {
    this.attracting = null;
    this.pending = null;
  }

  /** Apply per-frame attraction forces + check for contact to weld.
   *  Called from InputManager.update() every physics tick. */
  update() {
    if (!this.attracting) return;
    const B2 = b2();
    const { bodyA, bodyB } = this.attracting;

    // Apply attraction forces
    const posA = bodyA.GetPosition();
    const posB = bodyB.GetPosition();
    const dx = posA.x - posB.x;
    const dy = posA.y - posB.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.01) return;

    const massB = bodyB.GetMass();
    const fx = (dx / len) * 50 * massB;
    const fy = (dy / len) * 50 * massB;
    bodyB.ApplyForceToCenter(new B2.b2Vec2(fx, fy), true);
    if (isDynamic(bodyA)) {
      bodyA.ApplyForceToCenter(new B2.b2Vec2(-fx, -fy), true);
    }

    // Check for contact between the two bodies — poll contact data
    const contacts = bodyB.GetContactData();
    for (const cd of contacts) {
      const bodyIdA = B2.b2Shape_GetBody(cd.shapeIdA);
      const bodyIdB = B2.b2Shape_GetBody(cd.shapeIdB);
      const idA = this.ctx.game.pw.getBodyId(bodyA);
      const idB = this.ctx.game.pw.getBodyId(bodyB);
      const matchA = B2.B2_ID_EQUALS(bodyIdA, idA) || B2.B2_ID_EQUALS(bodyIdA, idB);
      const matchB = B2.B2_ID_EQUALS(bodyIdB, idA) || B2.B2_ID_EQUALS(bodyIdB, idB);
      if (matchA && matchB) {
        // Contact found — weld at contact point
        const mp = cd.manifold.pointCount > 0 ? cd.manifold.GetPoint(0) : null;
        const wp = mp ? { x: mp.point.x, y: mp.point.y } : { x: (posA.x + posB.x) / 2, y: (posA.y + posB.y) / 2 };
        createWeldJoint(this.ctx.game.pw, bodyA, bodyB, wp);
        this.attracting = null;
        return;
      }
    }
  }
}
