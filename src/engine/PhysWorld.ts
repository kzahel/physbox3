/**
 * Wrapper around box2d3-wasm World that provides:
 * - Body/joint tracking (v3 has no linked-list iteration)
 * - External userData storage (v3 has no built-in userData)
 * - Event processing (polled events → callback bridge)
 */
import type {
  Body,
  Joint,
  World,
  b2BodyDef,
  b2ExplosionDef,
  b2QueryFilter,
  b2ShapeId,
  b2Vec2,
} from "box2d3";
import type { BodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";

export type HitCallback = (
  point: { x: number; y: number },
  normal: { x: number; y: number },
  shapeA: b2ShapeId,
  shapeB: b2ShapeId,
  approachSpeed: number,
) => void;

export class PhysWorld {
  readonly world: World;
  private _bodies = new Set<Body>();
  private _joints = new Set<Joint>();
  private _bodyData = new Map<Body, BodyUserData>();

  // Event callbacks
  private _hitCallbacks: HitCallback[] = [];

  constructor(gravityX: number, gravityY: number) {
    const B2 = b2();
    const worldDef = B2.b2DefaultWorldDef();
    worldDef.gravity = new B2.b2Vec2(gravityX, gravityY);
    worldDef.enableSleep = true;
    worldDef.enableContinuous = true;
    this.world = new B2.World(worldDef);
  }

  // --- Body management ---

  createBody(def: b2BodyDef): Body {
    const body = this.world.CreateBody(def);
    if (!body) throw new Error("Failed to create body");
    this._bodies.add(body);
    return body;
  }

  destroyBody(body: Body): void {
    this._bodyData.delete(body);
    this._bodies.delete(body);
    if (body.IsValid()) body.Destroy();
  }

  forEachBody(cb: (body: Body) => void): void {
    for (const body of this._bodies) {
      if (body.IsValid()) cb(body);
    }
  }

  get bodies(): ReadonlySet<Body> {
    return this._bodies;
  }

  get bodyCount(): number {
    return this._bodies.size;
  }

  // --- UserData ---

  setUserData(body: Body, data: BodyUserData): void {
    this._bodyData.set(body, data);
  }

  getUserData(body: Body): BodyUserData | null {
    return this._bodyData.get(body) ?? null;
  }

  // --- Joint management ---

  addJoint(joint: Joint): void {
    this._joints.add(joint);
  }

  destroyJoint(joint: Joint): void {
    this._joints.delete(joint);
    if (joint.IsValid()) joint.Destroy(true);
  }

  forEachJoint(cb: (joint: Joint) => void): void {
    for (const joint of this._joints) {
      if (joint.IsValid()) cb(joint);
    }
  }

  // --- Events ---

  onHit(cb: HitCallback): void {
    this._hitCallbacks.push(cb);
  }

  /** Process events after world.Step(). Call this every physics tick. */
  processEvents(): void {
    if (this._hitCallbacks.length > 0) {
      const contactEvents = this.world.GetContactEvents();
      for (let i = 0; i < contactEvents.hitCount; i++) {
        const evt = contactEvents.GetHitEvent(i);
        for (const cb of this._hitCallbacks) {
          cb(
            { x: evt.point.x, y: evt.point.y },
            { x: evt.normal.x, y: evt.normal.y },
            evt.shapeIdA,
            evt.shapeIdB,
            evt.approachSpeed,
          );
        }
      }
    }
  }

  // --- Physics ---

  step(dt: number, subSteps: number): void {
    this.world.Step(dt, subSteps);
    this.processEvents();
    this.pruneInvalid();
  }

  setGravity(x: number, y: number): void {
    const B2 = b2();
    this.world.SetGravity(new B2.b2Vec2(x, y));
  }

  setRestitutionThreshold(threshold: number): void {
    this.world.SetRestitutionThreshold(threshold);
  }

  explode(def: b2ExplosionDef): void {
    const B2 = b2();
    B2.b2World_Explode(this.world.GetPointer(), def);
  }

  castRayClosest(origin: b2Vec2, translation: b2Vec2, filter?: b2QueryFilter) {
    const B2 = b2();
    const f = filter ?? B2.b2DefaultQueryFilter();
    return B2.b2World_CastRayClosest(this.world.GetPointer(), origin, translation, f);
  }

  overlapAABB(
    aabb: { lowerBound: b2Vec2; upperBound: b2Vec2 },
    filter: b2QueryFilter,
    // biome-ignore lint/suspicious/noExplicitAny: WASM callback type
    callback: any,
  ) {
    const B2 = b2();
    // biome-ignore lint/suspicious/noExplicitAny: WASM AABB type
    B2.b2World_OverlapAABB(this.world.GetPointer(), aabb as any, filter, callback);
  }

  // --- Cleanup ---

  private pruneInvalid(): void {
    for (const body of this._bodies) {
      if (!body.IsValid()) {
        this._bodyData.delete(body);
        this._bodies.delete(body);
      }
    }
    for (const joint of this._joints) {
      if (!joint.IsValid()) {
        this._joints.delete(joint);
      }
    }
  }

  /** Destroy the world and all tracking data. */
  destroy(): void {
    this.world.Destroy();
    this._bodies.clear();
    this._joints.clear();
    this._bodyData.clear();
  }
}
