import type { Body } from "box2d3";
import { b2 } from "./Box2D";
import type { PhysWorld } from "./PhysWorld";

export interface BodyOpts {
  type?: "dynamic" | "static" | "kinematic";
  rotation?: number;
  linearDamping?: number;
  angularDamping?: number;
  isBullet?: boolean;
  fixedRotation?: boolean;
  linearVelocity?: { x: number; y: number };
}

export interface ShapeOpts {
  density?: number;
  friction?: number;
  restitution?: number;
  hitEvents?: boolean;
  contactEvents?: boolean;
  isSensor?: boolean;
  tangentSpeed?: number;
}

/** Create a body at (x, y) with common defaults. */
export function makeBody(pw: PhysWorld, x: number, y: number, opts?: BodyOpts): Body {
  const B2 = b2();
  const def = B2.b2DefaultBodyDef();

  const t = opts?.type ?? "dynamic";
  if (t === "dynamic") def.type = B2.b2BodyType.b2_dynamicBody;
  else if (t === "kinematic") def.type = B2.b2BodyType.b2_kinematicBody;
  else def.type = B2.b2BodyType.b2_staticBody;

  def.position = new B2.b2Vec2(x, y);
  if (opts?.rotation != null) def.rotation = B2.b2MakeRot(opts.rotation);
  if (opts?.linearDamping != null) def.linearDamping = opts.linearDamping;
  if (opts?.angularDamping != null) def.angularDamping = opts.angularDamping;
  if (opts?.isBullet) def.isBullet = true;
  if (opts?.fixedRotation) {
    def.motionLocks = new B2.b2MotionLocks();
    def.motionLocks.angularZ = true;
  }
  if (opts?.linearVelocity) {
    def.linearVelocity = new B2.b2Vec2(opts.linearVelocity.x, opts.linearVelocity.y);
  }

  return pw.createBody(def);
}

/** Create a shape def with common defaults. hitEvents defaults to true. */
export function makeShapeDef(opts?: ShapeOpts) {
  const B2 = b2();
  const def = B2.b2DefaultShapeDef();

  if (opts?.density != null) def.density = opts.density;
  if (opts?.friction != null) def.material.friction = opts.friction;
  if (opts?.restitution != null) def.material.restitution = opts.restitution;
  if (opts?.tangentSpeed != null) def.material.tangentSpeed = opts.tangentSpeed;
  if (opts?.isSensor) def.isSensor = true;
  if (opts?.contactEvents) def.enableContactEvents = true;

  // Default hitEvents to true (most shapes want this)
  def.enableHitEvents = opts?.hitEvents !== false;

  return def;
}

/** Create a b2Circle at (0,0) with the given radius. */
export function makeCircle(radius: number, cx = 0, cy = 0) {
  const B2 = b2();
  const circle = new B2.b2Circle();
  circle.center = new B2.b2Vec2(cx, cy);
  circle.radius = radius;
  return circle;
}
