import type { Body, Joint } from "box2d3";
import { b2 } from "../../engine/Box2D";
import { areWelded, bodyRadius, createWeldJoint, distance } from "../../engine/Physics";
import { BrushTool } from "./BrushTool";

export const GLUE_RADIUS_PX = 28;

export class GlueTool extends BrushTool {
  readonly radiusPx = GLUE_RADIUS_PX;

  protected brushAction(bodies: Body[]) {
    const GAP = 0.5;
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        if (areWelded(this.ctx.game.pw, a, b)) continue;
        const dist = distance(a.GetPosition(), b.GetPosition());
        const rA = bodyRadius(a);
        const rB = bodyRadius(b);
        if (dist < rA + rB + GAP) {
          const posA = a.GetPosition();
          const posB = b.GetPosition();
          const midX = (posA.x + posB.x) / 2;
          const midY = (posA.y + posB.y) / 2;
          createWeldJoint(this.ctx.game.pw, a, b, { x: midX, y: midY });
        }
      }
    }
  }
}

export class UnGlueTool extends BrushTool {
  readonly radiusPx = GLUE_RADIUS_PX;

  protected brushAction(bodies: Body[]) {
    const B2 = b2();
    const pw = this.ctx.game.pw;
    const bodySet = new Set(bodies);
    const toDestroy: Joint[] = [];
    const seen = new Set<Joint>();

    pw.forEachJoint((joint) => {
      if (joint.GetType().value !== B2.b2JointType.b2_weldJoint.value) return;
      if (seen.has(joint)) return;
      // BodyRef from GetBodyA/B — compare via identity (same WASM object)
      const a = joint.GetBodyA();
      const b = joint.GetBodyB();
      // Check if either connected body is in the brush set
      for (const body of bodySet) {
        if (a === body || b === body) {
          seen.add(joint);
          toDestroy.push(joint);
          break;
        }
      }
    });
    for (const j of toDestroy) pw.destroyJoint(j);
  }
}
