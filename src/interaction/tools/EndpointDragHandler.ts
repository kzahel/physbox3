import type { Body, b2ShapeId } from "box2d3";
import { getBodyUserData } from "../../engine/BodyUserData";
import { b2 } from "../../engine/Box2D";
import { distance, isPolygonShape } from "../../engine/Physics";
import type { ToolContext } from "../ToolHandler";

const ENDPOINT_SNAP_PX = 24;
const PLATFORM_LABELS = new Set(["platform", "conveyor"]);

export interface EndpointDrag {
  body: Body;
  /** The endpoint that stays fixed (world coords) */
  fixedEnd: { x: number; y: number };
  /** Original shape half-height (thickness) */
  halfHeight: number;
  /** Original shape friction */
  friction: number;
  /** Original shape tangent speed (conveyor) */
  tangentSpeed: number;
}

export class EndpointDragHandler {
  private drag: EndpointDrag | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  get active(): boolean {
    return this.drag !== null;
  }

  /** Try to start an endpoint drag. Returns true if started. */
  tryStart(body: Body, wx: number, wy: number): boolean {
    const drag = this.detect(body, wx, wy);
    if (drag) {
      this.drag = drag;
      return true;
    }
    return false;
  }

  /** Move the dragged endpoint to (wx, wy). */
  move(wx: number, wy: number): void {
    if (!this.drag) return;
    const B2 = b2();
    const fixed = this.drag.fixedEnd;
    const dx = wx - fixed.x;
    const dy = wy - fixed.y;
    const len = Math.hypot(dx, dy);
    if (len < 0.2) return; // don't collapse to nothing

    const cx = (fixed.x + wx) / 2;
    const cy = (fixed.y + wy) / 2;
    const angle = Math.atan2(dy, dx);
    const halfWidth = len / 2;

    // Update body transform
    const rot = new B2.b2Rot();
    rot.SetAngle(angle);
    this.drag.body.SetTransform(new B2.b2Vec2(cx, cy), rot);

    // Destroy old shapes and recreate with new size
    const shapeIds: b2ShapeId[] = this.drag.body.GetShapes() ?? [];
    for (const sid of shapeIds) {
      B2.b2DestroyShape(sid, false);
    }

    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.material.friction = this.drag.friction;
    if (this.drag.tangentSpeed !== 0) {
      shapeDef.material.tangentSpeed = this.drag.tangentSpeed;
    }
    const box = B2.b2MakeBox(halfWidth, this.drag.halfHeight);
    this.drag.body.CreatePolygonShape(shapeDef, box);
    this.drag.body.ApplyMassFromShapes();
  }

  release(): void {
    this.drag = null;
  }

  /** Detect if the click is near an endpoint of a platform/conveyor. */
  private detect(body: Body, wx: number, wy: number): EndpointDrag | null {
    const B2 = b2();
    const ud = getBodyUserData(this.ctx.game.pw, body);
    if (!ud?.label || !PLATFORM_LABELS.has(ud.label)) return null;

    const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
    if (shapeIds.length === 0) return null;

    const shapeId = shapeIds[0];
    const shapeType = B2.b2Shape_GetType(shapeId);
    if (!isPolygonShape(shapeType)) return null;

    const poly = B2.b2Shape_GetPolygon(shapeId);
    // For a box shape, vertices are at corners. Extract half-extents from AABB-like analysis.
    let maxX = 0;
    let maxY = 0;
    for (let i = 0; i < poly.count; i++) {
      const v = poly.GetVertex(i);
      maxX = Math.max(maxX, Math.abs(v.x));
      maxY = Math.max(maxY, Math.abs(v.y));
    }
    const halfWidth = maxX;
    const halfHeight = maxY;

    const endA = body.GetWorldPoint(new B2.b2Vec2(-halfWidth, 0));
    const endB = body.GetWorldPoint(new B2.b2Vec2(halfWidth, 0));

    const snapRadius = ENDPOINT_SNAP_PX / this.ctx.game.camera.zoom;
    const pt = { x: wx, y: wy };
    const distA = distance(pt, endA);
    const distB = distance(pt, endB);

    const minDist = Math.min(distA, distB);
    if (minDist > snapRadius) return null;

    const fixedEnd = distA < distB ? endB : endA;

    // Get friction and tangent speed from shape material
    const friction = B2.b2Shape_GetFriction(shapeId);
    // tangentSpeed stored in material — read via flat API if available
    let tangentSpeed = 0;
    if (ud.label === "conveyor" && "speed" in ud) {
      tangentSpeed = (ud as { speed: number }).speed;
    }

    return {
      body,
      fixedEnd: { x: fixedEnd.x, y: fixedEnd.y },
      halfHeight,
      friction,
      tangentSpeed,
    };
  }
}
