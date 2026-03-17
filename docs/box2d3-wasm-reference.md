# box2d3-wasm API Reference

Complete reference for the box2d3-wasm JavaScript/TypeScript API as exposed via emscripten bindings.

## Projects & Authors

This stack is built from four independent projects by different authors:

**Box2D v3** — [github.com/erincatto/box2d](https://github.com/erincatto/box2d)
Author: **Erin Catto**. The core 2D physics engine written in pure C. Erin created the
original Box2D (~2007), which became one of the most widely used physics engines in games
(Angry Birds, Limbo, Crayon Physics Deluxe, etc.). Box2D v3 is a ground-up rewrite — not an
incremental upgrade from v2 — redesigned around data-oriented principles with SIMD support,
multithreaded solving, and a handle-based C API (no classes, no linked lists). The v2→v3
rewrite is why the API is so different from Planck.js (which wrapped v2).

**box2cpp** — [github.com/HolyBlackCat/box2cpp](https://github.com/HolyBlackCat/box2cpp)
Author: **HolyBlackCat**. A C++ RAII wrapper over Box2D v3's C API. Box2D v3 uses opaque
handle IDs (`b2BodyId`, `b2ShapeId`) and free functions (`b2Body_GetPosition(bodyId)`), which
is idiomatic C but awkward to bind to JavaScript. box2cpp wraps these into C++ classes
(`Body`, `Shape`, `Joint`) with constructors/destructors, which map cleanly to emscripten's
`class_<>` binding system. This is why the JS API has `body.GetPosition()` rather than
`b2Body_GetPosition(bodyId)`.

**enkiTS** — [github.com/dougbinks/enkiTS](https://github.com/dougbinks/enkiTS)
Author: **Doug Binks**. A lightweight C/C++ task scheduler. Box2D v3 supports multithreaded
physics solving — enkiTS provides the parallel task dispatch, which in the WASM build maps
to Web Workers via SharedArrayBuffer.

**box2d3-wasm** — [github.com/Birch-san/box2d3-wasm](https://github.com/Birch-san/box2d3-wasm)
Authors: **Alex Birch & Erik Sombroek**. The emscripten build that compiles all of the above
into WebAssembly. This includes: the emscripten compilation pipeline, `glue.cpp` (which
defines every class/method exposed to JavaScript via `EMSCRIPTEN_BINDINGS`), two WASM
flavors (deluxe with SIMD+threading, compat for older browsers), and utility modules for
debug drawing, camera, touch, and keyboard. Published to npm as `box2d3-wasm`.

The other three projects are included as git submodules in box2d3-wasm.

## Dependency Chain

```
erincatto/box2d        (C physics engine — the algorithms)
     ↓
HolyBlackCat/box2cpp   (C++ class wrapper — ergonomic API)
     ↓
dougbinks/enkiTS        (task scheduler — multithreaded solving)
     ↓
Birch-san/box2d3-wasm   (emscripten build — WASM + JS bindings)
     ↓
npm: box2d3-wasm        (what we import)
```

## Source Repos

Cloned into `reference/box2d3-wasm/` (gitignored):

| Path | Contents |
|------|----------|
| `box2d/include/box2d/` | C API headers: box2d.h, types.h, collision.h, math_functions.h (~4600 lines) |
| `box2cpp/include/box2cpp/` | C++ wrapper: box2cpp.h |
| `enkiTS/` | Task scheduler source |
| `box2d3-wasm/csrc/glue.cpp` | Emscripten bindings — defines what's exposed to JS (~1300 lines) |
| `box2d3-wasm/shell/` | Build scripts (CMake + emscripten) |

**Key source files for understanding the API:**
- `glue.cpp` is the definitive source for what methods exist in JS
- `box2d/include/box2d/box2d.h` has the full C API with doc comments
- `box2d/include/box2d/types.h` has all struct/enum definitions
- `node_modules/box2d3-wasm/build/dist/es/compat/Box2D.compat.d.ts` has TypeScript types (1,646 lines)

## Import Pattern

```typescript
// Types (compile-time only, via tsconfig path alias)
import type { MainModule, Body, World, Shape, Joint } from "box2d3";

// Runtime factory
import Box2DFactory from "box2d3-wasm";

// Initialize once
const b2 = await Box2DFactory();
```

## WASM Flavors

| Flavor | File | Size | Features |
|--------|------|------|----------|
| Deluxe | Box2D.deluxe.wasm | ~420KB | SIMD + SharedArrayBuffer threading |
| Compat | Box2D.compat.wasm | ~408KB | MVP only, no SIMD, no threading |

Auto-selected at runtime by `entry.mjs`. Deluxe requires cross-origin isolation headers (COOP/COEP).

---

## Math Types

### b2Vec2
```typescript
new b2Vec2()
new b2Vec2(x: number, y: number)
.x: number
.y: number
.Set(x, y): b2Vec2          // mutating, returns self
.Copy(other: b2Vec2): b2Vec2 // mutating, returns self
.Clone(): b2Vec2             // non-mutating copy
.Add(other): b2Vec2          // mutating +=
.Sub(other): b2Vec2          // mutating -=
.Mul(other): b2Vec2          // mutating component-wise *=
.MulSV(s: number): b2Vec2   // mutating scalar *=
```
Constant: `b2Vec2_zero`

### b2Rot
```typescript
new b2Rot()
.c: number  // cosine
.s: number  // sine
.SetAngle(radians: number): void
.GetAngle(): number
```
Constant: `b2Rot_identity`

### b2Transform
```typescript
new b2Transform()
.p: b2Vec2  // position (reference)
.q: b2Rot   // rotation (reference)
.ToBytes(): Uint8Array
```

### b2AABB
```typescript
new b2AABB()
.lowerBound: b2Vec2  // reference
.upperBound: b2Vec2  // reference
```

### b2Mat22
```typescript
new b2Mat22()
.cx: b2Vec2  // column x (reference)
.cy: b2Vec2  // column y (reference)
```

---

## World

### b2WorldDef
```typescript
new b2WorldDef()  // use b2DefaultWorldDef() instead
.gravity: b2Vec2
.restitutionThreshold: number
.hitEventThreshold: number
.contactHertz: number
.contactDampingRatio: number
.maximumLinearSpeed: number
.enableSleep: boolean
.enableContinuous: boolean
.workerCount: number
.internalValue: number  // DO NOT SET
```

### World class (box2cpp RAII wrapper)
```typescript
new World()
new World(def: b2WorldDef)
.Destroy(): void
.IsValid(): boolean
.Step(timeStep: number, subStepCount: number): void
.SetGravity(gravity: b2Vec2): void
.GetGravity(): b2Vec2
.GetAwakeBodyCount(): number
.Draw(debugDraw: b2DebugDraw): void

// Events (call after Step)
.GetBodyEvents(): b2BodyEvents
.GetContactEvents(): b2ContactEvents
.GetSensorEvents(): b2SensorEvents
.GetJointEvents(): b2JointEvents

// Settings
.SetContactTuning(hertz, dampingRatio, pushSpeed): void
.EnableContinuous(flag: boolean): void
.IsContinuousEnabled(): boolean
.EnableSleeping(flag: boolean): void
.IsSleepingEnabled(): boolean
.EnableWarmStarting(flag: boolean): void
.IsWarmStartingEnabled(): boolean
.SetMaximumLinearSpeed(speed: number): void
.GetMaximumLinearSpeed(): number
.SetRestitutionThreshold(value: number): void
.GetRestitutionThreshold(): number
.SetHitEventThreshold(value: number): void
.GetHitEventThreshold(): number

// Stats
.GetCounters(): b2Counters
.GetProfile(): b2Profile
.GetPointer(): number  // internal index

// Body creation
.CreateBody(def: b2BodyDef): Body  // returns owned Body*
```

### World-level free functions (C API, also available)
```typescript
// Queries (via C API - these use callbacks, tricky in WASM)
b2World_OverlapAABB(worldId, aabb, filter, callback, context)
b2World_OverlapShape(worldId, proxy, filter, callback, context)
b2World_CastRay(worldId, origin, translation, filter, callback, context)
b2World_CastRayClosest(worldId, origin, translation, filter): b2RayResult
b2World_CastShape(worldId, proxy, translation, filter, callback, context)

// Explosions
b2World_Explode(worldId, explosionDef)
```

---

## Body

### b2BodyDef
```typescript
new b2BodyDef()  // use b2DefaultBodyDef() instead
.type: b2BodyType          // b2_staticBody | b2_kinematicBody | b2_dynamicBody
.position: b2Vec2          // reference
.rotation: b2Rot           // reference
.linearVelocity: b2Vec2    // reference
.angularVelocity: number
.linearDamping: number
.angularDamping: number
.gravityScale: number
.sleepThreshold: number
.enableSleep: boolean
.isAwake: boolean
.isBullet: boolean
.isEnabled: boolean
.allowFastRotation: boolean
.motionLocks: b2MotionLocks  // reference
.internalValue: number     // DO NOT SET
```

### b2BodyType enum
```typescript
b2_staticBody = 0     // zero mass, zero velocity, manually moved
b2_kinematicBody = 1  // zero mass, velocity set by user
b2_dynamicBody = 2    // positive mass, velocity from forces
```

### b2MotionLocks
```typescript
new b2MotionLocks()
.linearX: boolean   // prevent X translation
.linearY: boolean   // prevent Y translation
.angularZ: boolean  // prevent rotation
```

### Body class (box2cpp RAII wrapper)
```typescript
// Lifecycle
.IsValid(): boolean
.Destroy(): void
.Enable(): void
.Disable(): void
.IsEnabled(): boolean

// Transform
.GetPosition(): b2Vec2
.GetRotation(): b2Rot
.GetTransform(): b2Transform
.SetTransform(position: b2Vec2, rotation: b2Rot): void

// Coordinate conversion
.GetLocalPoint(worldPoint: b2Vec2): b2Vec2
.GetWorldPoint(localPoint: b2Vec2): b2Vec2
.GetLocalVector(worldVector: b2Vec2): b2Vec2
.GetWorldVector(localVector: b2Vec2): b2Vec2

// Velocity
.GetLinearVelocity(): b2Vec2
.SetLinearVelocity(v: b2Vec2): void
.GetAngularVelocity(): number
.SetAngularVelocity(omega: number): void

// Forces & Impulses
.ApplyForce(force: b2Vec2, point: b2Vec2, wake: boolean): void
.ApplyForceToCenter(force: b2Vec2, wake: boolean): void
.ApplyTorque(torque: number, wake: boolean): void
.ApplyLinearImpulse(impulse: b2Vec2, point: b2Vec2, wake: boolean): void
.ApplyLinearImpulseToCenter(impulse: b2Vec2, wake: boolean): void
.ApplyAngularImpulse(impulse: number, wake: boolean): void

// Mass
.GetMass(): number
.GetRotationalInertia(): number
.GetLocalCenterOfMass(): b2Vec2
.GetWorldCenterOfMass(): b2Vec2
.SetMassData(massData: b2MassData): void
.GetMassData(): b2MassData
.ApplyMassFromShapes(): void

// Damping
.SetLinearDamping(damping: number): void
.GetLinearDamping(): number
.SetAngularDamping(damping: number): void
.GetAngularDamping(): number

// Gravity
.SetGravityScale(scale: number): void
.GetGravityScale(): number

// Sleep
.SetAwake(awake: boolean): void
.IsAwake(): boolean
.EnableSleep(flag: boolean): void
.IsSleepEnabled(): boolean
.SetSleepThreshold(threshold: number): void
.GetSleepThreshold(): number

// Bullet (continuous collision)
.SetBullet(flag: boolean): void
.IsBullet(): boolean

// Type
.SetType(type: b2BodyType): void
.GetType(): b2BodyType

// Attached shapes
.GetShapeCount(): number
.GetShapes(): b2ShapeId[]  // JS array via glue wrapper
.CreateCircleShape(def: b2ShapeDef, circle: b2Circle): Shape
.CreatePolygonShape(def: b2ShapeDef, polygon: b2Polygon): Shape
.CreateCapsuleShape(def: b2ShapeDef, capsule: b2Capsule): Shape
.CreateSegmentShape(def: b2ShapeDef, segment: b2Segment): Shape
.CreateChain(def: b2ChainDef): Chain

// Attached joints
.GetJointCount(): number
.GetJoints(): b2JointId[]  // JS array via glue wrapper

// Contact data
.GetContactCapacity(): number
.GetContactData(): b2ContactData[]  // JS array via glue wrapper
.EnableContactEvents(flag: boolean): void
.EnableHitEvents(flag: boolean): void

// AABB
.ComputeAABB(): b2AABB

// Name
.SetName(name: string): void
.GetName(): string

// Navigation
.GetWorld(): WorldRef
.GetPointer(): number  // internal index
```

---

## Shape

### b2ShapeDef
```typescript
new b2ShapeDef()  // use b2DefaultShapeDef() instead
.material: b2SurfaceMaterial     // reference
.density: number                 // kg/m^2
.filter: b2Filter                // reference
.enableCustomFiltering: boolean
.isSensor: boolean
.enableSensorEvents: boolean     // false by default, EVEN FOR SENSORS
.enableContactEvents: boolean    // false by default
.enableHitEvents: boolean        // false by default
.enablePreSolveEvents: boolean
.invokeContactCreation: boolean
.updateBodyMass: boolean
```

### b2SurfaceMaterial
```typescript
new b2SurfaceMaterial()  // or b2DefaultSurfaceMaterial()
.friction: number           // [0,1] Coulomb friction
.restitution: number        // [0,1] bounciness
.rollingResistance: number  // [0,1]
.tangentSpeed: number       // conveyor belt speed
.userMaterialId: number     // uint64
.customColor: number        // uint32 hex color
```

### b2Filter
```typescript
new b2Filter()  // or b2DefaultFilter()
.categoryBits: number   // uint32 (use string methods for 64-bit)
.maskBits: number       // uint32
.groupIndex: number
// 64-bit methods:
.setCategoryBits64(val: string): void
.getCategoryBits64(): string
.setMaskBits64(val: string): void
.getMaskBits64(): string
```

### b2QueryFilter
```typescript
new b2QueryFilter()  // or b2DefaultQueryFilter()
.categoryBits: number  // uint32
.maskBits: number      // uint32
// 64-bit string methods also available
```

### Shape Geometry Types

```typescript
// b2Circle
new b2Circle()
.center: b2Vec2  // reference, local space
.radius: number

// b2Capsule
new b2Capsule()
.center1: b2Vec2  // reference
.center2: b2Vec2  // reference
.radius: number

// b2Segment
new b2Segment()
.point1: b2Vec2  // reference
.point2: b2Vec2  // reference

// b2Polygon (DO NOT fill manually — use b2MakeBox etc.)
new b2Polygon()
.GetVertex(index: number): b2Vec2
.SetVertex(index: number, value: b2Vec2): void
.GetNormal(index: number): b2Vec2
.SetNormal(index: number, value: b2Vec2): void
.centroid: b2Vec2  // reference
.radius: number
.count: number
b2Polygon.GetMaxVertices(): number  // static, returns 8
```

### b2ShapeType enum
```typescript
b2_circleShape = 0
b2_capsuleShape = 1
b2_segmentShape = 2
b2_polygonShape = 3
b2_chainSegmentShape = 4
b2_shapeTypeCount = 5
```

### Shape class (box2cpp RAII wrapper)
```typescript
.IsValid(): boolean
.Destroy(updateBodyMass?: boolean): void
.GetType(): b2ShapeType
.GetAABB(): b2AABB

// Material properties
.GetDensity(): number
.SetDensity(density: number, updateBodyMass: boolean): void
.GetFriction(): number
.SetFriction(friction: number): void
.GetRestitution(): number
.SetRestitution(restitution: number): void

// Filter
.GetFilter(): b2Filter
.SetFilter(filter: b2Filter): void

// Events
.EnableContactEvents(flag: boolean): void
.AreContactEventsEnabled(): boolean
.EnableHitEvents(flag: boolean): void
.AreHitEventsEnabled(): boolean
.EnablePreSolveEvents(flag: boolean): void
.ArePreSolveEventsEnabled(): boolean
.IsSensor(): boolean

// Sensor data
.GetSensorCapacity(): number
.GetSensorData(): b2ShapeId[]

// Contact data
.GetContactCapacity(): number
.GetContactData(): b2ContactData[]

// Queries
.TestPoint(point: b2Vec2): boolean
.RayCast(input: b2RayCastInput): b2CastOutput
.GetClosestPoint(target: b2Vec2): b2Vec2

// Navigation
.GetBody(): BodyRef
.GetParentChain(): ChainRef
.GetWorld(): WorldRef
.GetPointer(): number
```

---

## Polygon Construction Functions

```typescript
// These are free functions on the module (b2.b2MakeBox etc.)
b2MakeBox(halfWidth: number, halfHeight: number): b2Polygon
b2MakeSquare(halfWidth: number): b2Polygon
b2MakeRoundedBox(halfWidth, halfHeight, radius): b2Polygon
b2MakeOffsetBox(halfWidth, halfHeight, center: b2Vec2, rotation: b2Rot): b2Polygon
b2MakeOffsetRoundedBox(halfWidth, halfHeight, center, rotation, radius): b2Polygon
b2MakePolygon(hull: b2Hull, radius: number): b2Polygon
b2MakeOffsetPolygon(hull: b2Hull, position: b2Vec2, rotation: b2Rot): b2Polygon
b2MakeOffsetRoundedPolygon(hull, position, rotation, radius): b2Polygon
b2TransformPolygon(transform: b2Transform, polygon: b2Polygon): b2Polygon

// Mass computation
b2ComputeCircleMass(shape: b2Circle, density: number): b2MassData
b2ComputeCapsuleMass(shape: b2Capsule, density: number): b2MassData
b2ComputePolygonMass(shape: b2Polygon, density: number): b2MassData

// AABB computation
b2ComputeCircleAABB(shape: b2Circle, transform: b2Transform): b2AABB
b2ComputeCapsuleAABB(shape: b2Capsule, transform: b2Transform): b2AABB
b2ComputePolygonAABB(shape: b2Polygon, transform: b2Transform): b2AABB
b2ComputeSegmentAABB(shape: b2Segment, transform: b2Transform): b2AABB

// Point-in-shape tests
b2PointInCircle(shape: b2Circle, point: b2Vec2): boolean
b2PointInCapsule(shape: b2Capsule, point: b2Vec2): boolean
b2PointInPolygon(shape: b2Polygon, point: b2Vec2): boolean

// Proxy construction (for overlap/cast queries)
b2MakeProxy(points: b2Vec2[], count: number, radius: number): b2ShapeProxy
b2MakeOffsetProxy(points, count, radius, position, rotation): b2ShapeProxy

b2IsValidRay(input: b2RayCastInput): boolean
```

Note: Low-level ray/shape cast functions (b2RayCastCircle, b2ShapeCastPolygon, etc.) are
**commented out** in glue.cpp and not available. Use World.CastRayClosest or World.CastRay instead.

---

## Chain Shape

### b2ChainDef
```typescript
new b2ChainDef()  // use b2DefaultChainDef() instead
.SetPoints(points: Array<{x: number, y: number}>): void  // JS array of {x,y}
.GetPoints(): Array<{x: number, y: number}>
.SetMaterials(materials: b2SurfaceMaterial[]): void
.GetMaterials(): b2SurfaceMaterial[]
.count: number  // read-only, set by SetPoints
.materialCount: number
.filter: b2Filter  // reference
.isLoop: boolean
.enableSensorEvents: boolean
.internalValue: number  // DO NOT SET
.delete(): void  // clean up allocated points
```

### Chain class (box2cpp RAII wrapper)
```typescript
.Destroy(): void
.IsValid(): boolean
.GetSegmentCount(): number
.GetSegments(): b2ShapeId[]  // JS array
.GetWorld(): WorldRef
.GetPointer(): number
```

### Chain C API functions
```typescript
b2Chain_IsValid(chainId: b2ChainId): boolean
b2Chain_GetSegmentCount(chainId: b2ChainId): number
b2Chain_GetSegments(chainId: b2ChainId, capacity: number): b2ShapeId[]
b2DefaultChainDef(): b2ChainDef
b2CreateChain(bodyId: b2BodyId, def: b2ChainDef): b2ChainId
b2DestroyChain(chainId: b2ChainId): void
```

---

## Joints

### b2JointType enum
```typescript
b2_distanceJoint = 0
b2_filterJoint = 1
b2_motorJoint = 2
b2_prismaticJoint = 3
b2_revoluteJoint = 4
b2_weldJoint = 5
b2_wheelJoint = 6
```

### b2JointDef (base for all joint defs)
```typescript
.bodyIdA: b2BodyId
.bodyIdB: b2BodyId
.localFrameA: b2Transform  // reference — anchor point + angle on body A
.localFrameB: b2Transform  // reference — anchor point + angle on body B
.collideConnected: boolean
```

### Joint class (box2cpp RAII wrapper)
```typescript
.Destroy(wakeAttached?: boolean): void
.IsValid(): boolean
.GetType(): b2JointType
.GetBodyA(): BodyRef
.GetBodyB(): BodyRef
.SetCollideConnected(flag: boolean): void
.GetCollideConnected(): boolean
.GetConstraintForce(): b2Vec2
.GetConstraintTorque(): number
.SetForceThreshold(threshold: number): void
.GetForceThreshold(): number
.SetTorqueThreshold(threshold: number): void
.GetTorqueThreshold(): number
.GetLocalFrameA(): b2Transform
.GetLocalFrameB(): b2Transform
.WakeBodies(): void
.GetWorld(): WorldRef
.GetPointer(): number
```

### DistanceJoint
```typescript
// b2DistanceJointDef
.base: b2JointDef
.length: number
.enableSpring: boolean
.hertz: number
.dampingRatio: number
.enableLimit: boolean
.minLength: number
.maxLength: number
.enableMotor: boolean
.maxMotorForce: number
.motorSpeed: number

// DistanceJoint class
.SetLength(length): void
.GetLength(): number
.EnableSpring(flag): void
.IsSpringEnabled(): boolean
.SetSpringHertz(hertz): void
.GetSpringHertz(): number
.SetSpringDampingRatio(ratio): void
.GetSpringDampingRatio(): number
.EnableLimit(flag): void
.IsLimitEnabled(): boolean
.SetLengthRange(min, max): void
.GetMinLength(): number
.GetMaxLength(): number
.GetCurrentLength(): number
.EnableMotor(flag): void
.IsMotorEnabled(): boolean
.SetMotorSpeed(speed): void
.GetMotorSpeed(): number
.SetMaxMotorForce(force): void
.GetMaxMotorForce(): number
.GetMotorForce(): number
```

### MotorJoint (used for grab tool — replaces MouseJoint from v2)
```typescript
// b2MotorJointDef
.base: b2JointDef
.linearVelocity: b2Vec2
.maxVelocityForce: number
.angularVelocity: number
.maxVelocityTorque: number
.linearHertz: number          // position spring stiffness
.linearDampingRatio: number
.maxSpringForce: number
.angularHertz: number         // rotation spring stiffness
.angularDampingRatio: number
.maxSpringTorque: number

// MotorJoint class
.SetLinearVelocity(velocity: b2Vec2): void
.GetLinearVelocity(): b2Vec2
.SetAngularVelocity(velocity: number): void
.GetAngularVelocity(): number
.SetMaxVelocityForce(force: number): void
.GetMaxVelocityForce(): number
.SetMaxVelocityTorque(torque: number): void
.GetMaxVelocityTorque(): number
.SetLinearHertz(hertz: number): void
.GetLinearHertz(): number
.SetLinearDampingRatio(ratio: number): void
.GetLinearDampingRatio(): number
.SetAngularHertz(hertz: number): void
.GetAngularHertz(): number
.SetAngularDampingRatio(ratio: number): void
.GetAngularDampingRatio(): number
.SetMaxSpringForce(force: number): void
.GetMaxSpringForce(): number
.SetMaxSpringTorque(torque: number): void
.GetMaxSpringTorque(): number
```

### RevoluteJoint (hinge/pin)
```typescript
// b2RevoluteJointDef
.base: b2JointDef
.targetAngle: number
.enableSpring: boolean
.hertz: number
.dampingRatio: number
.enableLimit: boolean
.lowerAngle: number   // min -0.99*pi
.upperAngle: number   // max 0.99*pi
.enableMotor: boolean
.maxMotorTorque: number
.motorSpeed: number

// RevoluteJoint class
.EnableSpring(flag): void
.IsSpringEnabled(): boolean
.SetSpringHertz(hertz): void
.GetSpringHertz(): number
.SetSpringDampingRatio(ratio): void
.GetSpringDampingRatio(): number
.SetTargetAngle(angle): void
.GetTargetAngle(): number
.GetAngle(): number
.EnableLimit(flag): void
.IsLimitEnabled(): boolean
.GetLowerLimit(): number
.GetUpperLimit(): number
.SetLimits(lower, upper): void
.EnableMotor(flag): void
.IsMotorEnabled(): boolean
.SetMotorSpeed(speed): void
.GetMotorSpeed(): number
.GetMotorTorque(): number
.SetMaxMotorTorque(torque): void
.GetMaxMotorTorque(): number
```

### WeldJoint (rigid connection with optional springs)
```typescript
// b2WeldJointDef
.base: b2JointDef
.linearHertz: number         // 0 = rigid
.angularHertz: number        // 0 = rigid
.linearDampingRatio: number
.angularDampingRatio: number

// WeldJoint class
.SetLinearHertz(hertz): void
.GetLinearHertz(): number
.SetLinearDampingRatio(ratio): void
.GetLinearDampingRatio(): number
.SetAngularHertz(hertz): void
.GetAngularHertz(): number
.SetAngularDampingRatio(ratio): void
.GetAngularDampingRatio(): number
```

### WheelJoint
```typescript
// b2WheelJointDef
.base: b2JointDef
.enableSpring: boolean
.hertz: number
.dampingRatio: number
.enableLimit: boolean
.lowerTranslation: number
.upperTranslation: number
.enableMotor: boolean
.maxMotorTorque: number
.motorSpeed: number

// WheelJoint class — same pattern as other joints
```

### PrismaticJoint (slider)
```typescript
// b2PrismaticJointDef
.base: b2JointDef
.enableSpring: boolean
.hertz: number
.dampingRatio: number
.targetTranslation: number
.enableLimit: boolean
.lowerTranslation: number
.upperTranslation: number
.enableMotor: boolean
.maxMotorForce: number
.motorSpeed: number

// PrismaticJoint class — same pattern as other joints
```

### FilterJoint (disables collision between two bodies)
```typescript
// b2FilterJointDef
.base: b2JointDef
// No additional properties
```

### Joint Creation (via World)
```typescript
// All joint creation goes through the World:
world.CreateDistanceJoint(def: b2DistanceJointDef): DistanceJoint
world.CreateMotorJoint(def: b2MotorJointDef): MotorJoint
world.CreateRevoluteJoint(def: b2RevoluteJointDef): RevoluteJoint
world.CreateWeldJoint(def: b2WeldJointDef): WeldJoint
world.CreateWheelJoint(def: b2WheelJointDef): WheelJoint
world.CreatePrismaticJoint(def: b2PrismaticJointDef): PrismaticJoint
world.CreateFilterJoint(def: b2FilterJointDef): FilterJoint
```

### Default Def Functions
```typescript
b2DefaultDistanceJointDef(): b2DistanceJointDef
b2DefaultMotorJointDef(): b2MotorJointDef
b2DefaultRevoluteJointDef(): b2RevoluteJointDef
b2DefaultWeldJointDef(): b2WeldJointDef
b2DefaultWheelJointDef(): b2WheelJointDef
b2DefaultPrismaticJointDef(): b2PrismaticJointDef
b2DefaultFilterJointDef(): b2FilterJointDef
```

---

## Events

All events are polled after `world.Step()`. Event data is **transient** — do not store references.

### b2BodyEvents
```typescript
.moveCount: number
.GetMoveEvent(index: number): b2BodyMoveEvent
```

### b2BodyMoveEvent
```typescript
.transform: b2Transform  // reference
.bodyId: b2BodyId
.fellAsleep: boolean
```

### b2ContactEvents
```typescript
.beginCount: number
.endCount: number
.hitCount: number
.GetBeginEvent(index: number): b2ContactBeginTouchEvent
.GetEndEvent(index: number): b2ContactEndTouchEvent
.GetHitEvent(index: number): b2ContactHitEvent
```

### b2ContactBeginTouchEvent
```typescript
.shapeIdA: b2ShapeId
.shapeIdB: b2ShapeId
```

### b2ContactEndTouchEvent
```typescript
.shapeIdA: b2ShapeId  // may be destroyed!
.shapeIdB: b2ShapeId  // may be destroyed!
```

### b2ContactHitEvent
```typescript
.shapeIdA: b2ShapeId
.shapeIdB: b2ShapeId
.point: b2Vec2     // reference — hit point in world space
.normal: b2Vec2    // reference — A→B normal
.approachSpeed: number  // always positive
```

### b2SensorEvents
```typescript
.beginCount: number
.endCount: number
.GetBeginEvent(index: number): b2SensorBeginTouchEvent
.GetEndEvent(index: number): b2SensorEndTouchEvent
```

### b2SensorBeginTouchEvent / b2SensorEndTouchEvent
```typescript
.sensorShapeId: b2ShapeId
.visitorShapeId: b2ShapeId
```

### b2JointEvents
```typescript
.count: number
.GetJointEvent(index: number): b2JointEvent
```

### b2JointEvent
```typescript
.jointId: b2JointId
```

---

## Contact Data

### b2ContactData
```typescript
.shapeIdA: b2ShapeId
.shapeIdB: b2ShapeId
.manifold: b2Manifold  // reference
```

### b2Manifold
```typescript
.normal: b2Vec2  // reference — world-space normal from A to B
.pointCount: number  // 0, 1, or 2
.GetPoint(index: number): b2ManifoldPoint
.SetPoint(index: number, point: b2ManifoldPoint): void
```

### b2ManifoldPoint
```typescript
.point: b2Vec2          // reference — world-space contact point
.anchorA: b2Vec2        // reference
.anchorB: b2Vec2        // reference
.separation: number     // negative = penetrating
.normalImpulse: number
.tangentImpulse: number
.totalNormalImpulse: number
.normalVelocity: number // negative = approaching
.id: number             // uint16
.persisted: boolean
```

---

## Explosions

### b2ExplosionDef
```typescript
new b2ExplosionDef()  // or b2DefaultExplosionDef()
.maskBits: number       // uint32, filter
.position: b2Vec2       // reference, world-space center
.radius: number
.falloff: number        // distance beyond radius where impulse drops to zero
.impulsePerLength: number  // impulse per unit perimeter facing explosion
```

---

## Ray Casting

### b2RayCastInput
```typescript
new b2RayCastInput()
.origin: b2Vec2        // reference — start point
.translation: b2Vec2   // reference — direction * max distance
.maxFraction: number   // typically 1.0
```

### b2RayResult (from CastRayClosest)
```typescript
.shapeId: b2ShapeId
.point: b2Vec2     // reference
.normal: b2Vec2    // reference
.fraction: number
.nodeVisits: number
.leafVisits: number
.hit: boolean
```

### b2CastOutput (from shape-level ray cast)
```typescript
.normal: b2Vec2    // reference
.point: b2Vec2     // reference
.fraction: number
.iterations: number
.hit: boolean
```

---

## ID Types

All IDs are value objects (passed by copy, safe to compare):

```typescript
// b2BodyId
.index1: number
.world0: number
.generation: number

// b2ShapeId
.index1: number
.world0: number
.generation: number

// b2WorldId
.index1: number
.generation: number

// b2ChainId
.index1: number
.world0: number
.generation: number

// b2JointId — exposed via the Joint class, not directly as value_object
```

---

## Profiling

### b2Profile (from World.GetProfile())
```typescript
// All values in milliseconds
.step, .pairs, .collide, .solve, .prepareStages
.solveConstraints, .prepareConstraints, .integrateVelocities
.warmStart, .solveImpulses, .integratePositions, .relaxImpulses
.applyRestitution, .storeImpulses, .splitIslands, .transforms
.sensorHits, .jointEvents, .hitEvents, .refit, .bullets
.sleepIslands, .sensors
```

### b2Counters (from World.GetCounters())
```typescript
.bodyCount, .shapeCount, .contactCount, .jointCount
.islandCount, .stackUsed, .staticTreeHeight, .treeHeight
.byteCount, .taskCount
.GetColorCount(index: number): number  // 0-11
```

---

## Utility Modules (in node_modules)

Available at `box2d3-wasm/build/dist/es/utils/`:

- **debugDraw.mjs** — Canvas-based physics debug visualization
- **camera.mjs** — Viewport/zoom camera utility
- **keyboard.mjs** — Keyboard input helpers
- **touchController.mjs** — Touch gesture handling

---

## Key Differences from Box2D v2 (Planck.js)

| v2 (Planck.js) | v3 (box2d3-wasm) |
|---|---|
| `body.getPosition()` | `body.GetPosition()` |
| `body.getUserData()` | External Map (no built-in userData in WASM) |
| Fixtures | Shapes (directly on body) |
| `body.getNext()` linked list | No iteration — track bodies yourself |
| MouseJoint | MotorJoint (no MouseJoint in v3) |
| Callbacks during Step | Events polled after Step |
| `world.createBody()` | `world.CreateBody(def)` |
| `fixture.getShape()` | `shape.GetType()` + `shape.GetCircle()` etc. |
| `body.createFixture(shape, density)` | `body.CreateCircleShape(shapeDef, circle)` |
| Listener callbacks | `world.GetContactEvents()` polling |
| `Vec2(x,y)` | `new b2Vec2(x,y)` |

---

## Building from Source

Requirements: Emscripten SDK, CMake, Python3

```bash
cd reference/box2d3-wasm/box2d3-wasm
# 1. Generate CMake build files
bash shell/0_build_makefile.sh
# 2. Build WASM
bash shell/1_build_wasm.sh
```

The build produces two flavors in `build/dist/es/`:
- `deluxe/` — SIMD + threading (requires SharedArrayBuffer)
- `compat/` — MVP WASM (broader browser support)

Submodules required:
- `box2d` — Box2D v3 C library
- `box2cpp` — C++ RAII wrapper
- `enkiTS` — Task scheduler for threading support
