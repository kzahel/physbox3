import type { Body, b2JointId, b2ShapeId } from "box2d3";
import { playExplosion } from "./Audio";
import { type BodyUserData, getBodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { IRenderer } from "./IRenderer";
import type { JointHandle, PhysWorld } from "./PhysWorld";

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

/** Shape type predicates — compare .value enums from b2Shape_GetType(). */
export function isCircleShape(shapeType: { value: number }): boolean {
  return shapeType.value === b2().b2ShapeType.b2_circleShape.value;
}
export function isPolygonShape(shapeType: { value: number }): boolean {
  return shapeType.value === b2().b2ShapeType.b2_polygonShape.value;
}
export function isSegmentShape(shapeType: { value: number }): boolean {
  return shapeType.value === b2().b2ShapeType.b2_segmentShape.value;
}
export function isCapsuleShape(shapeType: { value: number }): boolean {
  return shapeType.value === b2().b2ShapeType.b2_capsuleShape.value;
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

/** Recreate a body's shapes at a new scale.
 *  body.GetShapes() returns b2ShapeId[] — use flat API for geometry access. */
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

  // body.GetShapes() returns b2ShapeId[] (plain ID objects, not OOP Shape wrappers)
  const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
  for (const shapeId of shapeIds) {
    const shapeType = B2.b2Shape_GetType(shapeId);
    const entry: (typeof shapeData)[number] = {
      type: shapeType.value,
      density: B2.b2Shape_GetDensity(shapeId),
      friction: B2.b2Shape_GetFriction(shapeId),
      restitution: B2.b2Shape_GetRestitution(shapeId),
      isSensor: B2.b2Shape_IsSensor(shapeId),
    };

    if (isCircleShape(shapeType)) {
      const circle = B2.b2Shape_GetCircle(shapeId);
      entry.radius = circle.radius * scale;
      entry.centerX = circle.center.x * scale;
      entry.centerY = circle.center.y * scale;
    } else if (isPolygonShape(shapeType)) {
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

  // Destroy old shapes via flat API
  for (const shapeId of shapeIds) {
    B2.b2DestroyShape(shapeId, false);
  }

  // Create scaled shapes
  for (const sd of shapeData) {
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = sd.density;
    shapeDef.material.friction = sd.friction;
    shapeDef.material.restitution = sd.restitution;
    shapeDef.isSensor = sd.isSensor;

    if (sd.type === b2().b2ShapeType.b2_circleShape.value) {
      const circle = new B2.b2Circle();
      circle.center = new B2.b2Vec2(sd.centerX!, sd.centerY!);
      circle.radius = sd.radius!;
      body.CreateCircleShape(shapeDef, circle);
    } else if (sd.type === b2().b2ShapeType.b2_polygonShape.value && sd.verts) {
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
      return;
    }
    // Terrain bodies sit at origin — check if the point is near the surface
    const ud = pw.getUserData(body);
    if (ud?.label === "terrain" && "terrainPoints" in ud) {
      const pts = ud.terrainPoints as { x: number; y: number }[];
      for (let i = 0; i < pts.length - 1; i++) {
        if (distToSegment(center, pts[i], pts[i + 1]) < radius) {
          bodies.push(body);
          return;
        }
      }
    }
  });

  return bodies;
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Find the closest body to a world point, preferring exact testPoint hits.
 *  body.GetShapes() returns b2ShapeId[] — use flat API b2Shape_TestPoint. */
export function findClosestBody(pw: PhysWorld, wx: number, wy: number, radius: number): Body | null {
  const B2 = b2();
  const point = new B2.b2Vec2(wx, wy);
  let target: Body | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  pw.forEachBody((body) => {
    const pos = body.GetPosition();
    const d = distance(pos, { x: wx, y: wy });
    if (d > radius && bestDist <= radius) return;

    // Check if point is inside any shape using flat API
    const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
    for (const shapeId of shapeIds) {
      if (B2.b2Shape_TestPoint(shapeId, point)) {
        if (d < bestDist || bestDist > 0) {
          target = body;
          bestDist = 0;
        }
        return;
      }
    }

    if (d < bestDist && d < radius) {
      bestDist = d;
      target = body;
      return;
    }

    // Terrain bodies sit at origin — check surface segments
    const ud = pw.getUserData(body);
    if (ud?.label === "terrain" && "terrainPoints" in ud) {
      const pts = ud.terrainPoints as { x: number; y: number }[];
      for (let i = 0; i < pts.length - 1; i++) {
        const sd = distToSegment({ x: wx, y: wy }, pts[i], pts[i + 1]);
        if (sd < bestDist && sd < radius) {
          bestDist = sd;
          target = body;
        }
      }
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

/** Create a weld joint between two bodies at the given anchor point (world space). */
export function createWeldJoint(pw: PhysWorld, a: Body, b: Body, anchor: { x: number; y: number }) {
  const B2 = b2();
  const def = B2.b2DefaultWeldJointDef();

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

  def.base.bodyIdA = pw.getBodyId(a);
  def.base.bodyIdB = pw.getBodyId(b);
  def.base.collideConnected = false;
  const jointId = B2.b2CreateWeldJoint(pw.worldId, def);
  return pw.addJointId(jointId);
}

/** Check if two bodies are connected by a weld joint.
 *  body.GetJoints() returns b2JointId[] — use flat API for joint queries. */
export function areWelded(pw: PhysWorld, a: Body, b: Body): boolean {
  const B2 = b2();
  const bId = pw.getBodyId(b);
  const jointIds: b2JointId[] = a.GetJoints() ?? [];
  for (const jointId of jointIds) {
    if (B2.b2Joint_GetType(jointId).value !== B2.b2JointType.b2_weldJoint.value) continue;
    const bodyAId = B2.b2Joint_GetBodyA(jointId);
    const bodyBId = B2.b2Joint_GetBodyB(jointId);
    if (B2.B2_ID_EQUALS(bodyAId, bId) || B2.B2_ID_EQUALS(bodyBId, bId)) {
      return true;
    }
  }
  return false;
}

/** Collect all weld joint IDs attached to a body.
 *  body.GetJoints() returns b2JointId[] — use flat API for joint queries. */
export function getWeldJoints(_pw: PhysWorld, body: Body): b2JointId[] {
  const B2 = b2();
  const result: b2JointId[] = [];
  const jointIds: b2JointId[] = body.GetJoints() ?? [];
  for (const jointId of jointIds) {
    if (B2.b2Joint_GetType(jointId).value === B2.b2JointType.b2_weldJoint.value) {
      result.push(jointId);
    }
  }
  return result;
}

/** Compute the bounding radius of a body from its shapes.
 *  body.GetShapes() returns b2ShapeId[] — use flat API for geometry access. */
export function bodyRadius(body: Body): number {
  const B2 = b2();
  let maxR = 0;

  const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
  for (const shapeId of shapeIds) {
    const shapeType = B2.b2Shape_GetType(shapeId);

    if (isCircleShape(shapeType)) {
      const circle = B2.b2Shape_GetCircle(shapeId);
      maxR = Math.max(maxR, circle.radius);
    } else if (isPolygonShape(shapeType)) {
      const aabb = B2.b2Shape_GetAABB(shapeId);
      const ext = B2.b2Sub(aabb.upperBound, aabb.lowerBound);
      maxR = Math.max(maxR, B2.b2Length(ext) / 2);
    }
  }

  return maxR;
}

// ── Joint creation helpers ──
// These handle world-space anchor → local frame conversion, OOP/flat API fallback, and pw.addJoint tracking.

/** Create a revolute joint (hinge/pin) at a world-space anchor point. */
export function createRevoluteJoint(
  pw: PhysWorld,
  bodyA: Body,
  bodyB: Body,
  worldAnchor: { x: number; y: number },
  opts?: {
    collideConnected?: boolean;
    enableLimit?: boolean;
    lowerAngle?: number;
    upperAngle?: number;
    enableMotor?: boolean;
    motorSpeed?: number;
    maxMotorTorque?: number;
  },
): JointHandle {
  const B2 = b2();
  const def = B2.b2DefaultRevoluteJointDef();
  const anchorVec = new B2.b2Vec2(worldAnchor.x, worldAnchor.y);

  def.base.bodyIdA = pw.getBodyId(bodyA);
  def.base.bodyIdB = pw.getBodyId(bodyB);

  const frameA = new B2.b2Transform();
  frameA.p = bodyA.GetLocalPoint(anchorVec);
  frameA.q = B2.b2Rot_identity;
  def.base.localFrameA = frameA;

  const frameB = new B2.b2Transform();
  frameB.p = bodyB.GetLocalPoint(anchorVec);
  frameB.q = B2.b2Rot_identity;
  def.base.localFrameB = frameB;

  if (opts?.collideConnected) def.base.collideConnected = true;
  if (opts?.enableLimit) {
    def.enableLimit = true;
    if (opts.lowerAngle != null) def.lowerAngle = opts.lowerAngle;
    if (opts.upperAngle != null) def.upperAngle = opts.upperAngle;
  }
  if (opts?.enableMotor) {
    def.enableMotor = true;
    if (opts.motorSpeed != null) def.motorSpeed = opts.motorSpeed;
    if (opts.maxMotorTorque != null) def.maxMotorTorque = opts.maxMotorTorque;
  }

  const jointId = B2.b2CreateRevoluteJoint(pw.worldId, def);
  return pw.addJointId(jointId);
}

/** Create a distance joint between two world-space anchor points, optionally with spring. */
export function createDistanceJoint(
  pw: PhysWorld,
  bodyA: Body,
  bodyB: Body,
  worldAnchorA: { x: number; y: number },
  worldAnchorB: { x: number; y: number },
  opts?: {
    length?: number;
    collideConnected?: boolean;
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    enableLimit?: boolean;
    minLength?: number;
    maxLength?: number;
  },
): JointHandle {
  const B2 = b2();
  const def = B2.b2DefaultDistanceJointDef();
  const ancA = new B2.b2Vec2(worldAnchorA.x, worldAnchorA.y);
  const ancB = new B2.b2Vec2(worldAnchorB.x, worldAnchorB.y);

  def.base.bodyIdA = pw.getBodyId(bodyA);
  def.base.bodyIdB = pw.getBodyId(bodyB);

  const frameA = new B2.b2Transform();
  frameA.p = bodyA.GetLocalPoint(ancA);
  frameA.q = B2.b2Rot_identity;
  def.base.localFrameA = frameA;

  const frameB = new B2.b2Transform();
  frameB.p = bodyB.GetLocalPoint(ancB);
  frameB.q = B2.b2Rot_identity;
  def.base.localFrameB = frameB;

  def.length = opts?.length ?? B2.b2Distance(ancA, ancB);
  if (opts?.collideConnected) def.base.collideConnected = true;
  if (opts?.enableSpring) {
    def.enableSpring = true;
    if (opts.hertz != null) def.hertz = opts.hertz;
    if (opts.dampingRatio != null) def.dampingRatio = opts.dampingRatio;
  }
  if (opts?.enableLimit) {
    def.enableLimit = true;
    if (opts.minLength != null) def.minLength = opts.minLength;
    if (opts.maxLength != null) def.maxLength = opts.maxLength;
  }

  const jointId = B2.b2CreateDistanceJoint(pw.worldId, def);
  return pw.addJointId(jointId);
}

/** Create a wheel joint for vehicle suspension. Axis is in world space (typically (0,1) for vertical). */
export function createWheelJoint(
  pw: PhysWorld,
  chassis: Body,
  wheel: Body,
  wheelWorldPos: { x: number; y: number },
  worldAxis: { x: number; y: number },
  opts?: {
    enableSpring?: boolean;
    hertz?: number;
    dampingRatio?: number;
    enableMotor?: boolean;
    motorSpeed?: number;
    maxMotorTorque?: number;
  },
): JointHandle {
  const B2 = b2();
  const def = B2.b2DefaultWheelJointDef();
  const posVec = new B2.b2Vec2(wheelWorldPos.x, wheelWorldPos.y);

  def.base.bodyIdA = pw.getBodyId(chassis);
  def.base.bodyIdB = pw.getBodyId(wheel);

  // Axis direction encoded in localFrameA rotation
  const localAxis = chassis.GetLocalVector(new B2.b2Vec2(worldAxis.x, worldAxis.y));
  const axisAngle = Math.atan2(localAxis.y, localAxis.x);

  const frameA = new B2.b2Transform();
  frameA.p = chassis.GetLocalPoint(posVec);
  frameA.q = B2.b2MakeRot(axisAngle);
  def.base.localFrameA = frameA;

  const frameB = new B2.b2Transform();
  frameB.p = new B2.b2Vec2(0, 0);
  frameB.q = B2.b2Rot_identity;
  def.base.localFrameB = frameB;

  if (opts?.enableSpring !== false) {
    def.enableSpring = true;
    def.hertz = opts?.hertz ?? 3;
    def.dampingRatio = opts?.dampingRatio ?? 0.7;
  }
  if (opts?.enableMotor) {
    def.enableMotor = true;
    if (opts.motorSpeed != null) def.motorSpeed = opts.motorSpeed;
    if (opts.maxMotorTorque != null) def.maxMotorTorque = opts.maxMotorTorque;
  }

  const jointId = B2.b2CreateWheelJoint(pw.worldId, def);
  return pw.addJointId(jointId);
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
