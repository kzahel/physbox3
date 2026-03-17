import * as planck from "planck";
import { getBodyUserData } from "../../engine/BodyUserData";
import { findClosestBody } from "../../engine/Physics";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export const GRAB_RADIUS_PX = 30;
/** How close (in screen px) to an endpoint to trigger endpoint-drag instead of whole-body drag */
const ENDPOINT_SNAP_PX = 24;

const PLATFORM_LABELS = new Set(["platform", "conveyor"]);

interface EndpointDrag {
  body: planck.Body;
  /** The endpoint that stays fixed (world coords) */
  fixedEnd: planck.Vec2;
  /** Original fixture half-height (thickness) */
  halfHeight: number;
  /** Original fixture friction */
  friction: number;
  /** Original body userData */
  userData: any;
  /** Original fixture userData (conveyor stripe data etc.) */
  fixtureUserData: any;
}

export class GrabTool implements ToolHandler {
  private mouseJoint: planck.MouseJoint | null = null;
  private grabbedStatic: planck.Body | null = null;
  private endpointDrag: EndpointDrag | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number, _sx: number, _sy: number) {
    this.startGrab(wx, wy, GRAB_RADIUS_PX);
  }

  onMove(_wx: number, _wy: number, dx: number, dy: number, screenX: number, screenY: number) {
    if (this.endpointDrag) {
      const world = this.ctx.game.camera.toWorld(screenX, screenY, this.ctx.game.container);
      this.reshapePlatform(world.x, world.y);
    } else if (this.mouseJoint) {
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
    this.endpointDrag = null;
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
      // Check for endpoint drag on platform-like bodies
      const ep = this.tryEndpointDrag(target, wx, wy);
      if (ep) {
        this.endpointDrag = ep;
        return;
      }

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

  /** If the click is near an endpoint of a platform/conveyor, set up endpoint drag. */
  private tryEndpointDrag(body: planck.Body, wx: number, wy: number): EndpointDrag | null {
    const ud = getBodyUserData(body);
    if (!ud?.label || !PLATFORM_LABELS.has(ud.label)) return null;

    const fixture = body.getFixtureList();
    if (!fixture) return null;
    const shape = fixture.getShape();
    if (shape.getType() !== "polygon") return null;

    const poly = shape as planck.PolygonShape;
    // Box(hw, hh) vertices: (-hw,-hh), (hw,-hh), (hw,hh), (-hw,hh)
    const verts = poly.m_vertices;
    const halfWidth = Math.abs(verts[1].x); // positive
    const halfHeight = Math.abs(verts[0].y); // positive

    // Compute world-space endpoints (center-left and center-right of the box)
    const endA = body.getWorldPoint(planck.Vec2(-halfWidth, 0));
    const endB = body.getWorldPoint(planck.Vec2(halfWidth, 0));

    const snapRadius = ENDPOINT_SNAP_PX / this.ctx.game.camera.zoom;
    const distA = planck.Vec2.lengthOf(planck.Vec2.sub(planck.Vec2(wx, wy), endA));
    const distB = planck.Vec2.lengthOf(planck.Vec2.sub(planck.Vec2(wx, wy), endB));

    // Only trigger if close to one endpoint and not equally close to both (i.e. short platforms)
    const minDist = Math.min(distA, distB);
    if (minDist > snapRadius) return null;

    const fixedEnd = distA < distB ? endB : endA;

    return {
      body,
      fixedEnd: planck.Vec2(fixedEnd.x, fixedEnd.y),
      halfHeight,
      friction: fixture.getFriction(),
      userData: ud,
      fixtureUserData: fixture.getUserData(),
    };
  }

  /** Reshape the platform so the dragged endpoint moves to (wx, wy) while the fixed end stays put. */
  private reshapePlatform(wx: number, wy: number) {
    const drag = this.endpointDrag!;
    const fixed = drag.fixedEnd;
    const dx = wx - fixed.x;
    const dy = wy - fixed.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) return; // don't collapse to nothing

    const cx = (fixed.x + wx) / 2;
    const cy = (fixed.y + wy) / 2;
    const angle = Math.atan2(dy, dx);
    const halfWidth = len / 2;

    // Update body transform
    drag.body.setPosition(planck.Vec2(cx, cy));
    drag.body.setAngle(angle);

    // Replace the fixture with the new size
    const oldFixture = drag.body.getFixtureList();
    if (oldFixture) drag.body.destroyFixture(oldFixture);
    const newFixture = drag.body.createFixture({
      shape: planck.Box(halfWidth, drag.halfHeight),
      friction: drag.friction,
    });
    if (drag.fixtureUserData) newFixture.setUserData(drag.fixtureUserData);
  }
}
