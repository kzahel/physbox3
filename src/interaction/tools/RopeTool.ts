import type * as planck from "planck";
import type { ToolContext, ToolHandler } from "../ToolHandler";

/**
 * Base class for two-point joint tools (rope, spring).
 * Click once to set the first anchor, click again to complete the joint.
 */
abstract class TwoPointJointTool implements ToolHandler {
  /** Visible to Renderer for pending highlight */
  ropePending: { body: planck.Body | null; x: number; y: number } | null = null;
  protected ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    const body = this.ctx.findBodyAt(wx, wy);

    if (!this.ropePending) {
      this.ropePending = { body, x: wx, y: wy };
    } else {
      const a = this.ropePending;
      if (!(a.body && a.body === body)) {
        this.createJoint(a.x, a.y, wx, wy, a.body, body);
      }
      this.ropePending = null;
    }
  }

  reset() {
    this.ropePending = null;
  }

  protected abstract createJoint(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    bodyA: planck.Body | null,
    bodyB: planck.Body | null,
  ): void;
}

export class RopeTool extends TwoPointJointTool {
  protected createJoint(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    bodyA: planck.Body | null,
    bodyB: planck.Body | null,
  ) {
    this.ctx.game.addRopeBetween(x1, y1, x2, y2, bodyA, bodyB);
  }
}

export class SpringTool extends TwoPointJointTool {
  protected createJoint(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    bodyA: planck.Body | null,
    bodyB: planck.Body | null,
  ) {
    this.ctx.game.addSpring(x1, y1, x2, y2, bodyA, bodyB);
  }
}
