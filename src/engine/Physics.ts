import type { Body, b2ShapeId, Joint } from "box2d3";
import { playExplosion } from "./Audio";
import { type BodyUserData, getBodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { IRenderer } from "./IRenderer";
import type { PhysWorld } from "./PhysWorld";

/** Clamp a value between min and max (inclusive). */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Euclidean distance between two points. */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Check if a body is dynamic. */
export function isDynamic(body: Body): boolean {
  const B2 = b2();
  return body.GetType().value === B2.b2BodyType.b2_dynamicBody.value;
}

/** Get the angle of a body in radians. */
export function bodyAngle(body: Body): number {
  return b2().b2Rot_GetAngle(body.GetRotation());
}

/** Iterate all bodies in the world. */
export function forEachBody(pw: PhysWorld, cb: (body: Body) => void): void {
  pw.forEachBody(cb);
}

/** Iterate all bodies matching a type guard, passing the narrowed userData to the callback. */
export function forEachBodyByLabel<T extends BodyUserData>(
  pw: PhysWorld,
  guard: (ud: BodyUserData | null) => ud is T,
  cb: (body: Body, ud: T) => void,
  dynamicOnly = false,
): void {
  pw.forEachBody((b) => {
    if (dynamicOnly && !isDynamic(b)) return;
    const ud = getBodyUserData(pw, b);
    if (guard(ud)) cb(b, ud);
  });
}

/** Mark a body as destroyed in its userData so timer-based prefabs (cannons, dynamite) stop. */
export function markDestroyed(pw: PhysWorld, body: Body): void {
  const ud = pw.getUserData(body);
  if (ud) {
    ud.destroyed = true;
    pw.setUserData(body, ud);
  } else {
    pw.setUserData(body, { destroyed: true });
  }
}

/** Reusable explosion: particles, sound, built-in radial impulse */
export function explodeAt(
  pw: PhysWorld,
  renderer: IRenderer,
  wx: number,
  wy: number,
  radius: number,
  force: number,
): void {
  const B2 = b2();
  renderer.particles.spawnExplosion(wx, wy);
  playExplosion(0.3);

  const def = B2.b2DefaultExplosionDef();
  def.position = new B2.b2Vec2(wx, wy);
  def.radius = radius;
  def.falloff = radius;
  def.impulsePerLength = force;
  pw.explode(def);
}

/** Recreate a body's shapes at a new scale. */
export function scaleBody(_pw: PhysWorld, body: Body, scale: number): Body {
  const B2 = b2();

  // Collect shape data before destroying
  const shapeData: {
    type: number; // b2ShapeType value
    density: number;
    friction: number;
    restitution: number;
    isSensor: boolean;
    // Circle data
    radius?: number;
    centerX?: number;
    centerY?: number;
    // Polygon data
    verts?: { x: number; y: number }[];
  }[] = [];

  const shapes = body.GetShapes();
  if (shapes) {
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const shapeId = shape.GetPointer() as b2ShapeId;
      const shapeType = B2.b2Shape_GetType(shapeId);
      const entry: (typeof shapeData)[number] = {
        type: shapeType.value,
        density: B2.b2Shape_GetDensity(shapeId),
        friction: B2.b2Shape_GetFriction(shapeId),
        restitution: B2.b2Shape_GetRestitution(shapeId),
        isSensor: B2.b2Shape_IsSensor(shapeId),
      };

      if (shapeType.value === B2.b2ShapeType.b2_circleShape.value) {
        const circle = B2.b2Shape_GetCircle(shapeId);
        entry.radius = circle.radius * scale;
        entry.centerX = circle.center.x * scale;
        entry.centerY = circle.center.y * scale;
      } else if (shapeType.value === B2.b2ShapeType.b2_polygonShape.value) {
        const poly = B2.b2Shape_GetPolygon(shapeId);
        entry.verts = [];
        for (let j = 0; j < poly.count; j++) {
          const v = poly.GetVertex(j);
          entry.verts.push({ x: v.x * scale, y: v.y * scale });
        }
      } else {
        continue;
      }
      shapeData.push(entry);
    }
  }

  // Destroy old shapes
  if (shapes) {
    for (let i = 0; i < shapes.length; i++) {
      shapes[i].Destroy(false);
    }
  }

  // Create scaled shapes
  for (const sd of shapeData) {
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = sd.density;
    shapeDef.material.friction = sd.friction;
    shapeDef.material.restitution = sd.restitution;
    shapeDef.isSensor = sd.isSensor;

    if (sd.type === B2.b2ShapeType.b2_circleShape.value) {
      const circle = new B2.b2Circle();
      circle.center = new B2.b2Vec2(sd.centerX!, sd.centerY!);
      circle.radius = sd.radius!;
      body.CreateCircleShape(shapeDef, circle);
    } else if (sd.type === B2.b2ShapeType.b2_polygonShape.value && sd.verts) {
      const hull = B2.b2ComputeHull(sd.verts.map((v) => new B2.b2Vec2(v.x, v.y)));
      const poly = B2.b2MakePolygon(hull, 0);
      body.CreatePolygonShape(shapeDef, poly);
    }
  }

  body.ApplyMassFromShapes();
  return body;
}

/** Collect unique dynamic/static bodies whose center is within `radius` world-units of (wx, wy). */
export function queryBodiesInRadius(pw: PhysWorld, wx: number, wy: number, radius: number, exclude?: Body): Body[] {
  const center = { x: wx, y: wy };
  const bodies: Body[] = [];

  pw.forEachBody((body) => {
    if (body === exclude) return;
    if (distance(body.GetPosition(), center) < radius) {
      bodies.push(body);
    }
  });

  return bodies;
}

/** Find the closest body to a world point, preferring exact testPoint hits. */
export function findClosestBody(pw: PhysWorld, wx: number, wy: number, radius: number): Body | null {
  const B2 = b2();
  const point = new B2.b2Vec2(wx, wy);
  let target: Body | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  pw.forEachBody((body) => {
    const pos = body.GetPosition();
    const d = distance(pos, { x: wx, y: wy });
    if (d > radius && bestDist <= radius) return;

    // Check if point is inside any shape
    const shapes = body.GetShapes();
    if (shapes) {
      for (let i = 0; i < shapes.length; i++) {
        if (shapes[i].TestPoint(point)) {
          if (d < bestDist || bestDist > 0) {
            target = body;
            bestDist = 0;
          }
          return;
        }
      }
    }

    if (d < bestDist && d < radius) {
      bestDist = d;
      target = body;
    }
  });

  return target;
}

export function destroyBodyAt(pw: PhysWorld, wx: number, wy: number, radius = 0.5): boolean {
  const body = findClosestBody(pw, wx, wy, radius);
  if (body) {
    markDestroyed(pw, body);
    pw.destroyBody(body);
    return true;
  }
  return false;
}

/** Create a weld joint between two bodies at the given anchor point (world space).
 *  Returns the b2JointId for the created joint. */
export function createWeldJoint(pw: PhysWorld, a: Body, b: Body, anchor: { x: number; y: number }) {
  const B2 = b2();
  const def = B2.b2DefaultWeldJointDef();
  def.base.bodyIdA = a.GetPointer();
  def.base.bodyIdB = b.GetPointer();

  // Convert world-space anchor to local frames
  const anchorVec = new B2.b2Vec2(anchor.x, anchor.y);
  const localA = a.GetLocalPoint(anchorVec);
  const localB = b.GetLocalPoint(anchorVec);

  const frameA = new B2.b2Transform();
  frameA.p = localA;
  frameA.q = B2.b2Rot_identity;
  def.base.localFrameA = frameA;

  const frameB = new B2.b2Transform();
  frameB.p = localB;
  frameB.q = B2.b2Rot_identity;
  def.base.localFrameB = frameB;

  return B2.b2CreateWeldJoint(pw.world.GetPointer(), def);
}

/** Check if two bodies are connected by a weld joint. */
export function areWelded(_pw: PhysWorld, a: Body, b: Body): boolean {
  const B2 = b2();
  const bId = b.GetPointer();
  const joints = a.GetJoints();
  if (!joints) return false;
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    if (joint.GetType().value !== B2.b2JointType.b2_weldJoint.value) continue;
    const jId = joint.GetPointer();
    const bodyAId = B2.b2Joint_GetBodyA(jId);
    const bodyBId = B2.b2Joint_GetBodyB(jId);
    if (B2.B2_ID_EQUALS(bodyAId, bId) || B2.B2_ID_EQUALS(bodyBId, bId)) {
      return true;
    }
  }
  return false;
}

/** Collect all weld joints attached to a body (as flat API joint IDs). */
export function getWeldJoints(_pw: PhysWorld, body: Body): Joint[] {
  const B2 = b2();
  const result: Joint[] = [];
  const joints = body.GetJoints();
  if (!joints) return result;
  for (let i = 0; i < joints.length; i++) {
    const joint = joints[i];
    if (joint.GetType().value === B2.b2JointType.b2_weldJoint.value) {
      result.push(joint);
    }
  }
  return result;
}

/** Compute the bounding radius of a body from its shapes. */
export function bodyRadius(body: Body): number {
  const B2 = b2();
  let maxR = 0;

  const shapes = body.GetShapes();
  if (shapes) {
    for (let i = 0; i < shapes.length; i++) {
      const shape = shapes[i];
      const shapeId = shape.GetPointer() as b2ShapeId;
      const shapeType = B2.b2Shape_GetType(shapeId);

      if (shapeType.value === B2.b2ShapeType.b2_circleShape.value) {
        const circle = B2.b2Shape_GetCircle(shapeId);
        maxR = Math.max(maxR, circle.radius);
      } else if (shapeType.value === B2.b2ShapeType.b2_polygonShape.value) {
        const aabb = B2.b2Shape_GetAABB(shapeId);
        const ext = B2.b2Sub(aabb.upperBound, aabb.lowerBound);
        maxR = Math.max(maxR, B2.b2Length(ext) / 2);
      }
    }
  }

  return maxR;
}

export function clearDynamic(pw: PhysWorld): void {
  const toRemove: Body[] = [];
  pw.forEachBody((b) => {
    if (isDynamic(b)) toRemove.push(b);
  });
  for (const b of toRemove) {
    markDestroyed(pw, b);
    pw.destroyBody(b);
  }
}
