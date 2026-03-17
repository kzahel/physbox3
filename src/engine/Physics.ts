import * as planck from "planck";
import { playExplosion } from "./Audio";
import { type BodyUserData, getBodyUserData } from "./BodyUserData";
import type { IRenderer } from "./IRenderer";

/** Clamp a value between min and max (inclusive). */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Euclidean distance between two points. */
export function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Iterate all bodies in the world (hides Planck's linked-list API). */
export function forEachBody(world: planck.World, cb: (body: planck.Body) => void): void {
  for (let b = world.getBodyList(); b; b = b.getNext()) cb(b);
}

/** Iterate all bodies matching a type guard, passing the narrowed userData to the callback. */
export function forEachBodyByLabel<T extends BodyUserData>(
  world: planck.World,
  guard: (ud: BodyUserData | null) => ud is T,
  cb: (body: planck.Body, ud: T) => void,
  dynamicOnly = false,
): void {
  forEachBody(world, (b) => {
    if (dynamicOnly && !b.isDynamic()) return;
    const ud = getBodyUserData(b);
    if (guard(ud)) cb(b, ud);
  });
}

/**
 * Create a function that registers a world listener at most once per world instance.
 * Returns a guard function: call it with a world before using the listener.
 */
export function createWorldListener(register: (world: planck.World) => void): (world: planck.World) => void {
  const registered = new WeakSet<planck.World>();
  return (world) => {
    if (registered.has(world)) return;
    registered.add(world);
    register(world);
  };
}

/** Mark a body as destroyed in its userData so timer-based prefabs (cannons, dynamite) stop. */
export function markDestroyed(body: planck.Body): void {
  const ud = (body.getUserData() ?? {}) as Record<string, unknown>;
  ud.destroyed = true;
  body.setUserData(ud);
}

/** Reusable explosion: particles, sound, radial impulse */
export function explodeAt(
  world: planck.World,
  renderer: IRenderer,
  wx: number,
  wy: number,
  radius: number,
  force: number,
): void {
  const center = planck.Vec2(wx, wy);
  renderer.particles.spawnExplosion(wx, wy);
  playExplosion(0.3);

  const affected = queryBodiesInRadius(world, wx, wy, radius);

  for (const b of affected) {
    if (!b.isDynamic()) continue;
    const dir = planck.Vec2.sub(b.getPosition(), center);
    const len = planck.Vec2.lengthOf(dir);
    if (len < 0.01) continue;
    const falloff = 1 - len / radius;
    const impulse = planck.Vec2.mul(dir, (force * falloff * b.getMass()) / len);
    b.applyLinearImpulse(impulse, b.getPosition(), true);
  }
}

/** Recreate a body with all fixtures scaled */
export function scaleBody(_world: planck.World, body: planck.Body, scale: number): planck.Body {
  // Replace fixtures in-place (preserves joints, no body recreation needed)
  // Shapes are immutable in Box2D, so we destroy and recreate each fixture.
  const fixtureData: {
    density: number;
    friction: number;
    restitution: number;
    isSensor: boolean;
    userData: unknown;
    shapeType: string;
    radius?: number;
    center?: { x: number; y: number };
    verts?: { x: number; y: number }[];
  }[] = [];

  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const shape = f.getShape();
    const fd = {
      density: f.getDensity(),
      friction: f.getFriction(),
      restitution: f.getRestitution(),
      isSensor: f.isSensor(),
      userData: f.getUserData(),
      shapeType: shape.getType(),
    } as (typeof fixtureData)[number];

    if (shape.getType() === "circle") {
      const circle = shape as planck.CircleShape;
      const c = circle.getCenter();
      fd.radius = circle.getRadius() * scale;
      fd.center = { x: c.x * scale, y: c.y * scale };
    } else if (shape.getType() === "polygon") {
      const poly = shape as planck.PolygonShape;
      fd.verts = poly.m_vertices.map((v) => ({ x: v.x * scale, y: v.y * scale }));
    } else {
      continue;
    }
    fixtureData.push(fd);
  }

  // Remove old fixtures
  const toRemove: planck.Fixture[] = [];
  for (let f = body.getFixtureList(); f; f = f.getNext()) toRemove.push(f);
  for (const f of toRemove) body.destroyFixture(f);

  // Create scaled fixtures
  for (const fd of fixtureData) {
    let shape: planck.Shape;
    if (fd.shapeType === "circle") {
      shape = planck.Circle(planck.Vec2(fd.center!.x, fd.center!.y), fd.radius!);
    } else {
      shape = planck.Polygon(fd.verts!.map((v) => planck.Vec2(v.x, v.y)));
    }
    const fix = body.createFixture({
      shape,
      density: fd.density,
      friction: fd.friction,
      restitution: fd.restitution,
      isSensor: fd.isSensor,
    });
    if (fd.userData) fix.setUserData(fd.userData);
  }

  body.resetMassData();
  return body;
}

/** Collect unique dynamic/static bodies whose center is within `radius` world-units of (wx, wy). */
export function queryBodiesInRadius(
  world: planck.World,
  wx: number,
  wy: number,
  radius: number,
  exclude?: planck.Body,
): planck.Body[] {
  const center = planck.Vec2(wx, wy);
  const seen = new Set<planck.Body>();
  const bodies: planck.Body[] = [];

  world.queryAABB(
    planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
    (fixture) => {
      const body = fixture.getBody();
      if (body === exclude || seen.has(body)) return true;
      if (distance(body.getPosition(), center) < radius) {
        seen.add(body);
        bodies.push(body);
      }
      return true;
    },
  );

  return bodies;
}

/** Find the closest body to a world point, preferring exact testPoint hits. */
export function findClosestBody(world: planck.World, wx: number, wy: number, radius: number): planck.Body | null {
  const point = planck.Vec2(wx, wy);
  let target: planck.Body | null = null;
  let bestDist = Number.POSITIVE_INFINITY;

  world.queryAABB(
    planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
    (fixture) => {
      const body = fixture.getBody();
      if (fixture.testPoint(point)) {
        target = body;
        bestDist = 0;
        return false;
      }
      const d = distance(body.getPosition(), point);
      if (d < bestDist) {
        bestDist = d;
        target = body;
      }
      return true;
    },
  );

  return target;
}

export function destroyBodyAt(world: planck.World, wx: number, wy: number, radius = 0.5): boolean {
  const body = findClosestBody(world, wx, wy, radius);
  if (body) {
    markDestroyed(body);
    world.destroyBody(body);
    return true;
  }
  return false;
}

/** Create a weld joint between two bodies at the given anchor point. */
export function createWeldJoint(
  world: planck.World,
  a: planck.Body,
  b: planck.Body,
  anchor: planck.Vec2,
  opts: planck.WeldJointOpt = {},
): planck.Joint {
  return world.createJoint(planck.WeldJoint(opts, a, b, anchor))!;
}

/** Check if two bodies are connected by a weld joint. */
export function areWelded(a: planck.Body, b: planck.Body): boolean {
  for (let je = a.getJointList(); je; je = je.next) {
    const joint = je.joint;
    if (!joint || joint.getType() !== "weld-joint") continue;
    const other = joint.getBodyA() === a ? joint.getBodyB() : joint.getBodyA();
    if (other === b) return true;
  }
  return false;
}

/** Collect all weld joints attached to a body. */
export function getWeldJoints(body: planck.Body): planck.Joint[] {
  const joints: planck.Joint[] = [];
  for (let je = body.getJointList(); je; je = je.next) {
    const joint = je.joint;
    if (joint && joint.getType() === "weld-joint") joints.push(joint);
  }
  return joints;
}

/** Compute the bounding radius of a body from its fixtures. */
export function bodyRadius(body: planck.Body): number {
  let maxR = 0;
  for (let f = body.getFixtureList(); f; f = f.getNext()) {
    const shape = f.getShape();
    if (shape.getType() === "circle") {
      maxR = Math.max(maxR, (shape as planck.CircleShape).getRadius());
    } else if (shape.getType() === "polygon") {
      const aabb = new planck.AABB();
      shape.computeAABB(aabb, planck.Transform.identity(), 0);
      const ext = planck.Vec2.sub(aabb.upperBound, aabb.lowerBound);
      maxR = Math.max(maxR, planck.Vec2.lengthOf(ext) / 2);
    }
  }
  return maxR;
}

export function clearDynamic(world: planck.World): void {
  const toRemove: planck.Body[] = [];
  forEachBody(world, (b) => {
    if (b.isDynamic()) toRemove.push(b);
  });
  for (const b of toRemove) {
    markDestroyed(b);
    world.destroyBody(b);
  }
}
