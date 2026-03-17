import { b2 } from "../../engine/Box2D";
import type { JointHandle } from "../../engine/PhysWorld";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export class DetachTool implements ToolHandler {
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    const body = this.ctx.findBodyAt(wx, wy);
    if (!body) return;

    const B2 = b2();
    const pw = this.ctx.game.pw;
    const toRemove: JointHandle[] = [];
    pw.forEachJoint((joint) => {
      if (joint.GetType().value !== B2.b2JointType.b2_weldJoint.value) return;
      if (joint.GetBodyA() === body || joint.GetBodyB() === body) {
        toRemove.push(joint);
      }
    });
    for (const j of toRemove) pw.destroyJoint(j);
  }
}
