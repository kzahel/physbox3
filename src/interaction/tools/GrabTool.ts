import type { Body } from "box2d3";
import { isTerrain } from "../../engine/BodyUserData";
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
  /** Grab point in body-local coordinates */
  private localGrabX = 0;
  private localGrabY = 0;
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
    } else if (this.grabbedStatic) {
      const B2 = b2();
      const wdx = dx / this.ctx.game.camera.zoom;
      const wdy = -dy / this.ctx.game.camera.zoom;
      const pos = this.grabbedStatic.GetPosition();
      const rot = this.grabbedStatic.GetRotation();
      this.grabbedStatic.SetTransform(new B2.b2Vec2(pos.x + wdx, pos.y + wdy), rot);

      // Keep terrain userData points in sync with body movement
      const ud = this.ctx.game.pw.getUserData(this.grabbedStatic);
      if (isTerrain(ud)) {
        for (const p of ud.terrainPoints) {
          p.x += wdx;
          p.y += wdy;
        }
      }
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

  /** Called each physics tick by InputManager.update() to steer grabbed body */
  update() {
    if (!this.motorJoint || !this.grabbedBody) return;
    const B2 = b2();

    // World position of grab point on body
    const grabWorld = this.grabbedBody.GetWorldPoint(new B2.b2Vec2(this.localGrabX, this.localGrabY));

    // Desired velocity: pull grab point toward cursor
    const stiffness = 10;
    let vx = (this.targetX - grabWorld.x) * stiffness;
    let vy = (this.targetY - grabWorld.y) * stiffness;

    // Clamp max speed to prevent explosion on large gaps
    const maxSpeed = 50;
    const speed = Math.hypot(vx, vy);
    if (speed > maxSpeed) {
      vx = (vx / speed) * maxSpeed;
      vy = (vy / speed) * maxSpeed;
    }

    B2.b2MotorJoint_SetLinearVelocity(this.motorJoint.id, new B2.b2Vec2(vx, vy));
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

    // Ground anchor at grab point (world space, since ground is at origin)
    const frameA = new B2.b2Transform();
    frameA.p = new B2.b2Vec2(wx, wy);
    frameA.q = B2.b2Rot_identity;
    def.base.localFrameA = frameA;

    // Body anchor at grab point in body-local space
    const localPt = target.GetLocalPoint(new B2.b2Vec2(wx, wy));
    const frameB = new B2.b2Transform();
    frameB.p = localPt;
    frameB.q = B2.b2Rot_identity;
    def.base.localFrameB = frameB;

    this.localGrabX = localPt.x;
    this.localGrabY = localPt.y;

    // Velocity-based targeting with angular damping
    def.linearHertz = 0;
    def.linearDampingRatio = 0;
    def.maxSpringForce = 0;
    def.maxVelocityForce = 1000 * target.GetMass();
    // Gentle angular spring to resist wild spinning
    def.angularHertz = 2;
    def.angularDampingRatio = 1;
    def.maxSpringTorque = 50 * target.GetMass();

    const jointId = B2.b2CreateMotorJoint(pw.worldId, def);
    this.motorJoint = pw.addJointId(jointId);
    this.grabbedBody = target;
    this.targetX = wx;
    this.targetY = wy;
  }
}
