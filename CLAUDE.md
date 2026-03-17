# PhysBox 3

2D physics sandbox. Migrating from Planck.js (Box2D v2.4) to box2d3-wasm (Box2D v3, WASM+SIMD).

## Status: MIGRATION COMPLETE — All Phases Done

See `docs/migration-plan.md` for the full plan and `docs/box2d3-wasm-reference.md` for the complete API reference.

**Phase 1 done:** Game.ts, Physics.ts, Interpolation.ts, IRenderer.ts, main.ts.
**Phase 2 done:** Renderer.ts, OverlayRenderer.ts, ThreeJSRenderer.ts, PrefabOverlays.ts, SelectionButtons.ts.
**Phase 3 done:** All 18 prefabs migrated.
**Phase 4 done:** All tools migrated (GrabTool, AttractTool, EndpointDragHandler), ToolHandler.ts, InputManager.ts, RagdollController.ts, SettingsPane.ts.
**Phase 5 done:** WaterSystem.ts — raycasts via pw.castRayClosest(), body AABB via flat Shape API.
**Phase 6 done:** SceneStore.ts clean rewrite (shapes not fixtures, flat API for joint serialization), all test files migrated (64/64 pass).
**GetPointer fix:** Fixed systemic bug where body.GetPointer()/world.GetPointer() returned just index1 numbers instead of full ID structs. Added JointHandle class, PhysWorld.getBodyId/worldId.
**0 TS errors, 0 lint errors, 64/64 tests pass.**

## Build & Dev

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — biome check (formatting + linting)
- `npx tsc --noEmit` — type check (0 errors)

## Key Documentation

- `docs/migration-plan.md` — phased migration plan with status, gotchas, and order of work
- `docs/box2d3-wasm-reference.md` — **complete API reference** for box2d3-wasm. Covers all types, classes, methods, enums, events, and ID types. Use this as the authoritative source for API signatures — the auto-generated `.d.ts` is incomplete (e.g., missing `world.Create*Joint()` OOP methods).

## Architecture

- `src/engine/Box2D.ts` — WASM module singleton (async init)
- `src/engine/PhysWorld.ts` — World wrapper (body/joint tracking, userData, events)
- `src/engine/Game.ts` — game loop, prefab delegates (`Game.pw` is a `PhysWorld`)
- `src/engine/Physics.ts` — body queries, explosions, scaling, joint helpers (all take `PhysWorld`)
- `src/engine/Interpolation.ts` — frame interpolation (uses box2d3 Body type)
- `src/engine/IRenderer.ts` — renderer interface (`drawWorld` takes `PhysWorld`)
- `src/engine/Renderer.ts` — canvas rendering (migrated, uses flat shape API + PhysWorld)
- `src/engine/OverlayRenderer.ts` — tool overlays, selection UI (migrated, takes PhysWorld)
- `src/engine/ThreeJSRenderer.ts` — 3D WebGL renderer (migrated, same patterns as Renderer.ts)
- `src/engine/PrefabOverlays.ts` — conveyor/balloon/dynamite overlays (migrated)
- `src/engine/Camera.ts` — world/screen coordinate transforms, zoom, pan
- `src/interaction/InputManager.ts` — input handling, tool logic
- `src/ui/Toolbar.ts` — tool selection buttons + keyboard shortcuts
- `src/ui/SettingsPane.ts` — settings sidebar

## Key Conventions

### box2d3-wasm Patterns

- Types import from `"box2d3"` (tsconfig path alias → compat .d.ts)
- Runtime factory import from `"box2d3-wasm"`
- Call `b2()` to get the initialized module (throws if not init'd)
- Body userData stored in `PhysWorld.setUserData()` / `getUserData()` (external Map)
- Joint userData stored in `PhysWorld.setJointData()` / `getJointData()` (external Map)
- Body/joint iteration via `PhysWorld.forEachBody()` / `forEachJoint()` (tracked Set)
- Events polled after `world.Step()` via `PhysWorld.processEvents()`
- No MouseJoint in v3 — GrabTool uses MotorJoint (spring-based targeting with SetLinearVelocity each frame)

### Critical: ID structs vs OOP wrappers

- `body.GetShapes()` returns **`b2ShapeId[]`** (plain ID structs), NOT `Shape[]` OOP wrappers. Use flat API: `b2Shape_GetType(id)`, `b2Shape_GetCircle(id)`, `b2Shape_TestPoint(id, point)`, etc.
- `body.GetJoints()` returns **`b2JointId[]`** (plain ID structs), NOT `Joint[]` OOP wrappers. Use flat API: `b2Joint_GetType(id)`, `b2Joint_GetBodyA(id)`, etc.
- **`body.GetPointer()` / `world.GetPointer()` return ONLY `index1` (a number)**, NOT full ID structs. Do NOT use these for `bodyIdA`/`bodyIdB` on joint defs or `B2_ID_EQUALS` comparisons. Use `pw.getBodyId(body)` and `pw.worldId` instead.
- **`JointHandle`** (in PhysWorld.ts) wraps `b2JointId` with OOP-like methods via flat API. The WASM build doesn't expose joint creation on World, so joints are created via flat API (`b2CreateWeldJoint` etc.) which returns `b2JointId`. `JointHandle` provides `GetBodyA()`, `GetBodyB()`, `GetType()`, `IsValid()`, `Destroy()`, etc. Use `pw.addJointId(id)` to create and track a JointHandle.
- `jointHandle.GetBodyA()` / `GetBodyB()` return the actual `Body` OOP wrapper (resolved via PhysWorld tracking). Cast `as unknown as Body` for full API access.

### Established Migration Patterns

```typescript
// Body creation
const B2 = b2();
const bodyDef = B2.b2DefaultBodyDef();
bodyDef.type = B2.b2BodyType.b2_dynamicBody;
bodyDef.position = new B2.b2Vec2(x, y);
const body = pw.createBody(bodyDef);

// Shape creation
const shapeDef = B2.b2DefaultShapeDef();
shapeDef.density = 1;
shapeDef.enableHitEvents = true;
shapeDef.material.restitution = 0.5;
body.CreateCircleShape(shapeDef, circle);
body.CreatePolygonShape(shapeDef, B2.b2MakeBox(halfW, halfH));

// UserData
pw.setUserData(body, { fill: "#f00", label: "ball" });

// Body type check
isDynamic(body)  // body.GetType().value === B2.b2BodyType.b2_dynamicBody.value

// Body angle
B2.b2Rot_GetAngle(body.GetRotation())

// Shape geometry (via flat API on b2ShapeId)
const shapeIds: b2ShapeId[] = body.GetShapes();
B2.b2Shape_GetCircle(shapeId)   // → b2Circle { center, radius }
B2.b2Shape_GetPolygon(shapeId)  // → b2Polygon { count, GetVertex(i) }
B2.b2Shape_GetSegment(shapeId)  // → b2Segment { point1, point2 }
B2.b2Shape_GetCapsule(shapeId)  // → b2Capsule { center1, center2, radius }
B2.b2Shape_IsSensor(shapeId)    // → boolean

// Joint anchors (world-space) — joint.GetBodyA/B() returns BodyRef, cast to Body
const bodyA = joint.GetBodyA() as unknown as Body;
const localFrameA = joint.GetLocalFrameA();  // → b2Transform { p, q }
const worldAnchor = bodyA.GetWorldPoint(localFrameA.p);

// Joint type check
joint.GetType().value === B2.b2JointType.b2_distanceJoint.value

// Joint userData (for rope stabilizers etc.)
pw.setJointData(joint, { ropeStabilizer: true });
pw.getJointData(joint)?.ropeStabilizer

// Joint creation helpers (Physics.ts) — handle anchor conversion, OOP/flat fallback, pw.addJoint
createRevoluteJoint(pw, bodyA, bodyB, { x, y }, { enableLimit: true, lowerAngle: -PI/3, upperAngle: PI/3 })
createDistanceJoint(pw, bodyA, bodyB, anchorA, anchorB, { enableSpring: true, hertz: 5, dampingRatio: 0.3 })
createWheelJoint(pw, chassis, wheel, wheelPos, { x: 0, y: 1 }, { enableMotor: true, motorSpeed: 4, maxMotorTorque: 200 })

// Conveyor belt: tangentSpeed is built into b2SurfaceMaterial (no pre-solve callback needed)
shapeDef.material.tangentSpeed = speed;

// Ragdoll foot contacts: polled via body.GetContactData() instead of event listeners
// Cannonball impacts: polled via body.GetContactData() instead of begin-contact listener
```

### Mobile / Touch is First Class

Every interaction must work on touch devices. Mouse-specific interactions (hover, right-click, middle-click) are fine as extras, but every tool and feature must have a touch-equivalent path.

### Tools

Tools are defined by: adding to the `Tool` union type in ToolHandler.ts, adding to the `TOOLS` array in Toolbar.ts, handling in InputManager, and optionally adding cursor visuals in Renderer.ts.

### Physics

- box2d3-wasm world with Y-up coordinate system
- Joint types in use: MotorJoint (grab), RevoluteJoint (ropes), WeldJoint (attach)
- Bodies store style via `PhysWorld.setUserData(body, { fill, label })`

### Workflow

- After completing any feature change, commit and push immediately without waiting to be asked.
