import type { Body } from "box2d3";
import { b2 } from "../../engine/Box2D";
import { findClosestBody, isDynamic } from "../../engine/Physics";
import type { JointHandle } from "../../engine/PhysWorld";
import type { ToolContext, ToolHandler } from "../ToolHandler";
import { EndpointDragHandler } from "./EndpointDragHandler";

export const GRAB_RADIUS_PX = 30;

export class GrabTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "drag" as const;
  private motorJoint: JointHandle | null = null;
  private grabbedBody: Body | null = null;
  private grabbedStatic: Body | null = null;
  private targetX = 0;
  private targetY = 0;
  private endpointDrag: EndpointDragHandler;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
    this.endpointDrag = new EndpointDragHandler(ctx);
  }

  onDown(wx: number, wy: number, _sx: number, _sy: number) {
    this.startGrab(wx, wy, GRAB_RADIUS_PX);
  }

  onMove(_wx: number, _wy: number, dx: number, dy: number, screenX: number, screenY: number) {
    if (this.endpointDrag.active) {
      const world = this.ctx.game.camera.toWorld(screenX, screenY, this.ctx.game.container);
      this.endpointDrag.move(world.x, world.y);
    } else if (this.motorJoint) {
      const world = this.ctx.game.camera.toWorld(screenX, screenY, this.ctx.game.container);
      this.targetX = world.x;
      this.targetY = world.y;
      this.updateMotorJoint();
    } else if (this.grabbedStatic) {
      const B2 = b2();
      const wdx = dx / this.ctx.game.camera.zoom;
      const wdy = -dy / this.ctx.game.camera.zoom;
      const pos = this.grabbedStatic.GetPosition();
      const rot = this.grabbedStatic.GetRotation();
      this.grabbedStatic.SetTransform(new B2.b2Vec2(pos.x + wdx, pos.y + wdy), rot);
    }
  }

  onUp() {
    if (this.motorJoint) {
      this.ctx.game.pw.destroyJoint(this.motorJoint);
      this.motorJoint = null;
      this.grabbedBody = null;
    }
    this.grabbedStatic = null;
    this.endpointDrag.release();
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
    const target = findClosestBody(this.ctx.game.pw, wx, wy, radius);

    if (target) {
      if (this.endpointDrag.tryStart(target, wx, wy)) return;

      if (isDynamic(target) && !this.ctx.game.paused) {
        this.createMotorJoint(target, wx, wy);
      } else {
        this.grabbedStatic = target;
      }
    }
  }

  private createMotorJoint(target: Body, wx: number, wy: number) {
    const B2 = b2();
    const pw = this.ctx.game.pw;
    const def = B2.b2DefaultMotorJointDef();

    def.base.bodyIdA = pw.getBodyId(this.ctx.groundBody);
    def.base.bodyIdB = pw.getBodyId(target);

    // Set local frames: ground anchor at target position, body anchor at origin
    const frameA = new B2.b2Transform();
    frameA.p = new B2.b2Vec2(wx, wy);
    frameA.q = B2.b2Rot_identity;
    def.base.localFrameA = frameA;

    const frameB = new B2.b2Transform();
    frameB.p = target.GetLocalPoint(new B2.b2Vec2(wx, wy));
    frameB.q = B2.b2Rot_identity;
    def.base.localFrameB = frameB;

    // Spring-based targeting parameters
    def.linearHertz = 5;
    def.linearDampingRatio = 0.7;
    def.maxSpringForce = 1000 * target.GetMass();
    def.angularHertz = 0;
    def.angularDampingRatio = 0;

    const jointId = B2.b2CreateMotorJoint(pw.worldId, def);
    this.motorJoint = pw.addJointId(jointId);
    this.grabbedBody = target;
    this.targetX = wx;
    this.targetY = wy;
  }

  private updateMotorJoint() {
    if (!this.motorJoint || !this.grabbedBody) return;
    const B2 = b2();
    const pos = this.grabbedBody.GetPosition();
    // Compute velocity toward target: v = (target - pos) * hertz
    const hertz = 5;
    const vx = (this.targetX - pos.x) * hertz;
    const vy = (this.targetY - pos.y) * hertz;
    // Use flat API for motor joint velocity control
    B2.b2MotorJoint_SetLinearVelocity(this.motorJoint.id, new B2.b2Vec2(vx, vy));
  }
}
