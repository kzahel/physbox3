/**
 * Wrapper around box2d3-wasm World that provides:
 * - Body/joint tracking (v3 has no linked-list iteration)
 * - External userData storage (v3 has no built-in userData)
 * - Event processing (polled events → callback bridge)
 */
import type {
  Body,
  b2BodyDef,
  b2BodyId,
  b2ExplosionDef,
  b2JointId,
  b2JointType,
  b2QueryFilter,
  b2ShapeId,
  b2Transform,
  b2Vec2,
  b2WorldId,
  World,
} from "box2d3";
import type { BodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";

/**
 * Lightweight JS wrapper around b2JointId that provides OOP-like methods
 * using the flat API. Needed because the WASM build doesn't expose joint
 * creation on the World class, so we must use the flat C API (which returns
 * b2JointId, not Joint OOP wrappers).
 */
export class JointHandle {
  readonly id: b2JointId;
  // biome-ignore lint/suspicious/noExplicitAny: circular ref avoidance — actually PhysWorld
  private _pw: any;
  // biome-ignore lint/suspicious/noExplicitAny: circular ref avoidance
  constructor(id: b2JointId, pw: any) {
    this.id = id;
    this._pw = pw;
  }

  IsValid(): boolean {
    return b2().b2Joint_IsValid(this.id);
  }
  Destroy(wake = true): void {
    b2().b2DestroyJoint(this.id, wake);
  }
  GetType(): b2JointType {
    return b2().b2Joint_GetType(this.id);
  }
  /** Returns the Body OOP wrapper resolved via PhysWorld tracking. */
  GetBodyA(): Body {
    const B2 = b2();
    const bodyId: b2BodyId = B2.b2Joint_GetBodyA(this.id);
    return (this._pw.findBodyByIndex1(bodyId.index1) ?? bodyId) as unknown as Body;
  }
  /** Returns the Body OOP wrapper resolved via PhysWorld tracking. */
  GetBodyB(): Body {
    const B2 = b2();
    const bodyId: b2BodyId = B2.b2Joint_GetBodyB(this.id);
    return (this._pw.findBodyByIndex1(bodyId.index1) ?? bodyId) as unknown as Body;
  }
  GetLocalFrameA(): b2Transform {
    return b2().b2Joint_GetLocalFrameA(this.id);
  }
  GetLocalFrameB(): b2Transform {
    return b2().b2Joint_GetLocalFrameB(this.id);
  }
  GetCollideConnected(): boolean {
    return b2().b2Joint_GetCollideConnected(this.id);
  }
  GetPointer(): b2JointId {
    return this.id;
  }
}

export type HitCallback = (
  point: { x: number; y: number },
  normal: { x: number; y: number },
  shapeA: b2ShapeId,
  shapeB: b2ShapeId,
  approachSpeed: number,
) => void;

export class PhysWorld {
  readonly world: World;
  /** Cached b2WorldId for flat API calls. */
  private _worldId!: b2WorldId;
  private _bodies = new Set<Body>();
  private _joints = new Set<JointHandle>();
  private _bodyData = new Map<Body, BodyUserData>();
  private _jointData = new Map<JointHandle, Record<string, unknown>>();
  /** Maps Body OOP wrapper → full b2BodyId (needed for flat API joint creation). */
  private _bodyIds = new Map<Body, b2BodyId>();

  // Event callbacks
  private _hitCallbacks: HitCallback[] = [];

  constructor(gravityX: number, gravityY: number) {
    const B2 = b2();
    const worldDef = B2.b2DefaultWorldDef();
    worldDef.gravity = new B2.b2Vec2(gravityX, gravityY);
    worldDef.enableSleep = true;
    worldDef.enableContinuous = true;
    this.world = new B2.World(worldDef);
    this._captureWorldId();
  }

  /** Capture the b2WorldId by creating a temp body+shape, extracting the ID, then cleaning up. */
  private _captureWorldId(): void {
    const B2 = b2();
    // Create a temp body via OOP (the only way we can create bodies)
    const def = B2.b2DefaultBodyDef();
    def.type = B2.b2BodyType.b2_staticBody;
    const tempBody = this.world.CreateBody(def)!;
    // Give it a shape so we can extract the b2BodyId via b2Shape_GetBody
    const shapeDef = B2.b2DefaultShapeDef();
    const circle = new B2.b2Circle();
    circle.center = new B2.b2Vec2(0, 0);
    circle.radius = 0.001;
    tempBody.CreateCircleShape(shapeDef, circle);
    const shapes: b2ShapeId[] = tempBody.GetShapes() ?? [];
    const bodyId: b2BodyId = B2.b2Shape_GetBody(shapes[0]);
    // b2Body_GetWorld takes a b2BodyId and returns a b2WorldId
    this._worldId = B2.b2Body_GetWorld(bodyId);
    // Clean up
    tempBody.Destroy();
  }

  // --- Body management ---

  static MAX_BODIES = 2000;

  get isFull(): boolean {
    return this._bodies.size >= PhysWorld.MAX_BODIES;
  }

  createBody(def: b2BodyDef): Body {
    const body = this.world.CreateBody(def);
    if (!body) throw new Error("Failed to create body");
    this._bodies.add(body);
    // Capture the b2BodyId via a temp shape (the OOP Body wrapper doesn't expose it)
    this._captureBodyId(body);
    return body;
  }

  /** Find a tracked Body OOP wrapper by its b2BodyId.index1 value. */
  findBodyByIndex1(index1: number): Body | null {
    for (const [body, id] of this._bodyIds) {
      if (id.index1 === index1) return body;
    }
    return null;
  }

  /** Get the b2BodyId for a body, needed for flat API joint creation. */
  getBodyId(body: Body): b2BodyId {
    const cached = this._bodyIds.get(body);
    if (cached) return cached;
    // Fallback: try to get it via shapes
    this._captureBodyId(body);
    return this._bodyIds.get(body)!;
  }

  /** Get the b2WorldId for flat API calls. */
  get worldId(): b2WorldId {
    return this._worldId;
  }

  private _captureBodyId(body: Body): void {
    const B2 = b2();
    const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
    if (shapeIds.length > 0) {
      // Fast path: body already has shapes, get b2BodyId from the first one
      this._bodyIds.set(body, B2.b2Shape_GetBody(shapeIds[0]));
      return;
    }
    // Slow path: create a temp shape, extract the b2BodyId, then destroy it
    const shapeDef = B2.b2DefaultShapeDef();
    const circle = new B2.b2Circle();
    circle.center = new B2.b2Vec2(0, 0);
    circle.radius = 0.001;
    body.CreateCircleShape(shapeDef, circle);
    const tempShapes: b2ShapeId[] = body.GetShapes() ?? [];
    if (tempShapes.length > 0) {
      this._bodyIds.set(body, B2.b2Shape_GetBody(tempShapes[0]));
      B2.b2DestroyShape(tempShapes[0], false);
    }
  }

  destroyBody(body: Body): void {
    this._bodyData.delete(body);
    this._bodyIds.delete(body);
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

  /** Create a JointHandle from a b2JointId and track it. */
  addJointId(id: b2JointId): JointHandle {
    const handle = new JointHandle(id, this);
    this._joints.add(handle);
    return handle;
  }

  /** Track an existing JointHandle. */
  addJoint(joint: JointHandle): void {
    this._joints.add(joint);
  }

  destroyJoint(joint: JointHandle): void {
    this._jointData.delete(joint);
    this._joints.delete(joint);
    if (joint.IsValid()) joint.Destroy(true);
  }

  forEachJoint(cb: (joint: JointHandle) => void): void {
    for (const joint of this._joints) {
      if (joint.IsValid()) cb(joint);
    }
  }

  setJointData(joint: JointHandle, data: Record<string, unknown>): void {
    this._jointData.set(joint, data);
  }

  getJointData(joint: JointHandle): Record<string, unknown> | null {
    return this._jointData.get(joint) ?? null;
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
    B2.b2World_Explode(this._worldId, def);
  }

  castRayClosest(origin: b2Vec2, translation: b2Vec2, filter?: b2QueryFilter) {
    const B2 = b2();
    const f = filter ?? B2.b2DefaultQueryFilter();
    return B2.b2World_CastRayClosest(this._worldId, origin, translation, f);
  }

  overlapAABB(
    aabb: { lowerBound: b2Vec2; upperBound: b2Vec2 },
    filter: b2QueryFilter,
    // biome-ignore lint/suspicious/noExplicitAny: WASM callback type
    callback: any,
  ) {
    const B2 = b2();
    // biome-ignore lint/suspicious/noExplicitAny: WASM AABB type
    B2.b2World_OverlapAABB(this._worldId, aabb as any, filter, callback);
  }

  // --- Cleanup ---

  private pruneInvalid(): void {
    for (const body of this._bodies) {
      if (!body.IsValid()) {
        this._bodyData.delete(body);
        this._bodies.delete(body);
      }
    }
    for (const jh of this._joints) {
      if (!jh.IsValid()) {
        this._jointData.delete(jh);
        this._joints.delete(jh);
      }
    }
  }

  /** Destroy the world and all tracking data. */
  destroy(): void {
    this.world.Destroy();
    this._bodies.clear();
    this._joints.clear();
    this._bodyData.clear();
    this._jointData.clear();
  }
}
