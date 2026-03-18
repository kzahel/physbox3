# PhysBox 3

2D physics sandbox using box2d3-wasm (Box2D v3, WASM+SIMD).

## Agent Instructions

- Do NOT use the auto-memory system (`~/.claude/projects/.../memory/`). Store all persistent project context in this file (`CLAUDE.md`) and in `docs/` instead.

## Build & Dev

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — biome check (formatting + linting)
- `npx tsc --noEmit` — type check
- `source scripts/use-emsdk.sh` — expose repo-local `emcc` / `emmake` / `emcmake` in the current shell
- `scripts/use-emsdk.sh emcc --version` — run one emsdk-backed command without modifying the current shell

## Deploy

Hosted at **https://kzahel.com/physbox/** via Cloudflare R2 + Worker.

- `npm run deploy` — build + upload to R2 + deploy worker
- `npm run deploy:worker` — redeploy worker only (no rebuild)

The Worker (`worker/index.js`) serves static files from the `physbox` R2 bucket and sets COOP/COEP headers required for SharedArrayBuffer (WASM multithreading). Config in `worker/wrangler.toml`.

## Key Documentation

- `docs/box2d3-wasm-reference.md` — **complete API reference** for box2d3-wasm. Covers all types, classes, methods, enums, events, and ID types. Use this as the authoritative source for API signatures — the auto-generated `.d.ts` is incomplete (e.g., missing `world.Create*Joint()` OOP methods).
- `docs/particle-system-mvp-plan.md` — **primary particle system plan**. Narrow sidecar/MVP plan for a LiquidFun-derived SPH-style solver coupled to Box2D v3 inside the same WASM module.
- `docs/particle-system-plan.md` — **historical full-scope particle plan**. Earlier full LiquidFun-port analysis, useful as background but not the current source of truth for MVP implementation.

## Architecture

- `src/engine/Box2D.ts` — WASM module singleton (async init)
- `src/engine/PhysWorld.ts` — World wrapper (body/joint tracking, userData, events)
- `src/engine/Game.ts` — game loop, prefab delegates (`Game.pw` is a `PhysWorld`)
- `src/engine/Physics.ts` — body queries, explosions, scaling, joint helpers (all take `PhysWorld`)
- `src/engine/Interpolation.ts` — frame interpolation
- `src/engine/IRenderer.ts` — renderer interface (`drawWorld` takes `PhysWorld`)
- `src/engine/Renderer.ts` — canvas rendering (flat shape API + PhysWorld)
- `src/engine/OverlayRenderer.ts` — tool overlays, selection UI
- `src/engine/ThreeJSRenderer.ts` — 3D WebGL renderer
- `src/engine/PrefabOverlays.ts` — conveyor/balloon/dynamite overlays
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
- **`JointHandle`** (in PhysWorld.ts) wraps `b2JointId` with OOP-like methods via flat API. Joints are created via flat API (`b2CreateWeldJoint` etc.) which returns `b2JointId`. `JointHandle` provides `GetBodyA()`, `GetBodyB()`, `GetType()`, `IsValid()`, `Destroy()`, etc. Use `pw.addJointId(id)` to create and track a JointHandle.
- `jointHandle.GetBodyA()` / `GetBodyB()` return `Body` directly (resolved via PhysWorld tracking). No cast needed.

### Code Patterns

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

// Joint anchors (world-space) — joint.GetBodyA/B() returns Body directly
const bodyA = joint.GetBodyA();
const localFrameA = joint.GetLocalFrameA();  // → b2Transform { p, q }
const worldAnchor = bodyA.GetWorldPoint(localFrameA.p);

// Joint type check
joint.GetType().value === B2.b2JointType.b2_distanceJoint.value

// Joint userData (for rope stabilizers etc.)
pw.setJointData(joint, { ropeStabilizer: true });
pw.getJointData(joint)?.ropeStabilizer

// Joint creation helpers (Physics.ts)
createRevoluteJoint(pw, bodyA, bodyB, { x, y }, { enableLimit: true, lowerAngle: -PI/3, upperAngle: PI/3 })
createDistanceJoint(pw, bodyA, bodyB, anchorA, anchorB, { enableSpring: true, hertz: 5, dampingRatio: 0.3 })
createWheelJoint(pw, chassis, wheel, wheelPos, { x: 0, y: 1 }, { enableMotor: true, motorSpeed: 4, maxMotorTorque: 200 })

// Conveyor belt: tangentSpeed is built into b2SurfaceMaterial
shapeDef.material.tangentSpeed = speed;

// Contacts: polled via body.GetContactData()
```

### Mobile / Touch is First Class

Every interaction must work on touch devices. Mouse-specific interactions (hover, right-click, middle-click) are fine as extras, but every tool and feature must have a touch-equivalent path.

### Tools

Tools are defined by: adding to the `Tool` union type in ToolHandler.ts, adding to the `TOOLS` array in Toolbar.ts, handling in InputManager, and optionally adding cursor visuals in Renderer.ts.

### Physics

- box2d3-wasm world with Y-up coordinate system
- Joint types in use: MotorJoint (grab), RevoluteJoint (ropes), WeldJoint (attach)
- Bodies store style via `PhysWorld.setUserData(body, { fill, label })`

### Particle System (In Progress)

Building a narrow particle sidecar inside a forked `box2d3-wasm` (`kzahel/box2d3-wasm`, branch `particle-system`). The solver is LiquidFun-derived, but the goal is not full LiquidFun API parity. Particle stepping and rigid-body coupling run inside the same WASM module as Box2D v3 — no JS↔WASM boundary crossings in the hot path. Start with `docs/particle-system-mvp-plan.md`; use `docs/particle-system-plan.md` as historical background only.

**Reference repos:**
- `reference/box2d3-wasm/` — our fork (submodule → `kzahel/box2d3-wasm`), particle files in `box2d3-wasm/csrc/particle/`
- `reference/liquidfun/` — Google's LiquidFun (Box2D v2 + particles), source of particle system C++
- `reference/box2d3-wasm/box2d/` — upstream Box2D v3 C source (submodule of box2d3-wasm)

**Build:** `bash scripts/build-box2d-wasm.sh` rebuilds the WASM module from source. To expose `emcc` manually, use `source scripts/use-emsdk.sh`.

### Particle Performance Invariants

Preserve these very carefully while iterating on the particle system:

- Keep the dependency direction one-way: particle solver -> Box2D bridge -> Box2D v3. Do not let Box2D-facing code leak throughout solver internals.
- Keep particle stepping and particle↔rigid-body coupling inside WASM. Do not move hot-path orchestration back into JS.
- Keep particle data array-based and contiguous in the hot path. Avoid per-particle heap objects or pointer-heavy ownership models.
- Avoid JS callbacks in the hot path.
- Avoid per-step heap allocation in solver passes. Reuse buffers / scratch storage where possible.
- Keep the Box2D bridge thin, flat, and data-oriented. Avoid virtual dispatch or overly object-heavy wrappers in the hot path.
- Keep the public JS API minimal and batch-oriented.
- Protect the bridge contract with tests so later memory-layout work (including a future SOA redesign) can change internals without changing the external behavior beyond tolerances.
- Profile before doing SIMD- or threading-specific rewrites. The first-order win is same-WASM-module execution, not premature micro-optimization.

### Workflow

- After completing any feature change, commit and push immediately without waiting to be asked.
