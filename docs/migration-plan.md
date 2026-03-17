# Planck.js → box2d3-wasm Migration Plan

## Overview

Migrate PhysBox from Planck.js (Box2D v2.4, pure JS) to box2d3-wasm (Box2D v3, WASM+SIMD).

**Why:** Box2D v3 has data-oriented design, built-in multithreading, SIMD, and is specifically
optimized for large piles of bodies — exactly what we need for sand particles. Expected 3-5x
performance improvement for active particle scenarios.

**Scope:** 46 files import planck, ~1,350 lines of planck-specific code.

## Key API Differences

| Concept | Planck.js | box2d3-wasm |
|---------|-----------|-------------|
| API style | `body.getPosition()` | `body.GetPosition()` (OOP wrapper available) |
| Fixtures | `body.createFixture({shape, density})` | No fixtures — `body.CreateCircleShape(shapeDef, circle)` |
| UserData | `body.setUserData({fill, label})` | None — external `Map<Body, BodyUserData>` via PhysWorld |
| Body iteration | `world.getBodyList()` linked list | None — must track bodies ourselves (PhysWorld._bodies Set) |
| Joint iteration | `world.getJointList()` linked list | None — must track joints ourselves (PhysWorld._joints Set) |
| Events | Callbacks: `world.on("begin-contact", cb)` | Polled: `world.GetContactEvents()` after Step |
| Vec2 creation | `planck.Vec2(x, y)` (factory) | `new B2.b2Vec2(x, y)` (constructor) |
| World step | `world.step(dt, velIter, posIter)` | `world.Step(dt, subSteps)` |
| Shapes | `planck.Circle(r)`, `planck.Box(w,h)` | `new B2.b2Circle()`, `B2.b2MakeBox(w,h)` |
| Shape types | `shape.getType() === "circle"` | Enum: `B2.b2ShapeType.b2_circleShape` |
| Module init | Synchronous `import * as planck` | Async `await Box2DFactory()` |
| Memory | JS GC | Mostly GC via OOP wrapper, explicit `Destroy()` for world/body/joint |
| Body type check | `body.isDynamic()` | `body.GetType().value === B2.b2BodyType.b2_dynamicBody.value` |
| Body angle | `body.getAngle()` | `B2.b2Rot_GetAngle(body.GetRotation())` |
| Bounciness | `world.on("pre-solve", cb)` | `world.SetRestitutionThreshold()` or material restitution |
| Collision sounds | `world.on("post-solve", cb)` | Hit events via `PhysWorld.onHit()` |
| Explosion | Manual radial impulse | Built-in `b2World_Explode()` |

## What's Already Done

- [x] `box2d3-wasm` installed, `planck` removed from dependencies
- [x] `src/engine/Box2D.ts` — async WASM module singleton (`initBox2D()`, `b2()`)
- [x] `src/engine/PhysWorld.ts` — World wrapper with body/joint tracking, external userData, event polling
- [x] `src/box2d3-wasm.d.ts` — type declarations bridging ESM/WASM module
- [x] `tsconfig.json` — `paths` alias for `box2d3` types
- [x] `vite.config.ts` — COOP/COEP headers for SharedArrayBuffer, WASM exclusion from optimizeDeps
- [x] `src/engine/BodyUserData.ts` — fully migrated (imports box2d3 Body type, `getBodyUserData` takes `PhysWorld`)

## Migration Strategy: Direct Rewrite

No compatibility layer. Each file is directly rewritten to use box2d3-wasm APIs via PhysWorld.
No backward compatibility for saved scenes — SceneStore gets a clean rewrite for the new format.

### Phase 1: Core Engine + Minimal Renderer (must be done together)

These files form the physics backbone and must be migrated as a unit. Include minimal
Renderer.ts support (circles + boxes) so we can visually test immediately.

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| `Game.ts` | ~280 | HIGH | World creation, stepping, collision events, gravity, prefab delegates |
| `Physics.ts` | ~220 | HIGH | Body queries, AABB, explosions, scaling, joint creation, iteration |
| `Interpolation.ts` | ~70 | LOW | Body type change + method renames |
| `IRenderer.ts` | ~20 | LOW | Interface — change `planck.World` param to `PhysWorld` |
| `main.ts` | ~140 | LOW | Add `await initBox2D()` before `new Game()` |

**Key decisions:**
- `Game.ts` owns a `PhysWorld` instead of `planck.World`
- All `forEachBody(world, cb)` → `physWorld.forEachBody(cb)`
- Collision sounds: switch from `world.on("post-solve")` to hit events with `physWorld.onHit()`
- Bounciness: use `world.SetRestitutionThreshold()` or per-shape material restitution
- Explosion: use built-in `b2World_Explode()` via `PhysWorld.explode()`

### Phase 2: Renderers

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| `Renderer.ts` | ~380 | MEDIUM | Body/joint drawing. No fixtures — iterate shapes instead. Shape type enums. |
| `ThreeJSRenderer.ts` | ~large | MEDIUM | Same changes as Renderer.ts |
| `OverlayRenderer.ts` | ~varies | MEDIUM | Tool overlays, body info display |
| `PrefabOverlays.ts` | ~varies | LOW | Just type references |

**Key changes:**
- `body.getFixtureList()` → `body.GetShapes()` (returns array, not linked list)
- Shape type detection: `shape.getType() === "circle"` → enum comparison
- Circle rendering: `circle.getCenter()` / `circle.getRadius()` → `b2Shape_GetCircle(shapeId).center/.radius`
- Polygon rendering: `poly.m_vertices` → `polygon.GetVertex(i)` with `polygon.count`
- Joint rendering: `world.getJointList()` → `physWorld.forEachJoint(cb)`. Joint anchors differ (local transforms, not world-space).
- No `fixture.getUserData()` — use body-level fill only (most prefabs already do this)

### Phase 3: Prefabs (can be done in parallel batches)

All 18 prefab files follow the same pattern: create bodies, add shapes, set userData, create joints.

**Batch A — Simple (body + shape only):**
- `Ball.ts`, `Box.ts`, `Platform.ts`, `Polygon.ts` (~5-20 lines each)
- Mechanical translation: `createBody()` + `createFixture()` → `pw.createBody()` + `body.CreateCircleShape()`

**Batch B — Joints:**
- `Seesaw.ts` (revolute), `SpringBall.ts` (distance), `Launcher.ts` (prismatic + weld)
- Joint creation via flat API: `B2.b2CreateRevoluteJoint(worldId, def)`

**Batch C — Complex:**
- `Car.ts` (wheel joints), `Train.ts` (wheel joints, multi-body)
- `Rope.ts` (~120 lines, revolute chains + rope stabilizers)
- `Ragdoll.ts` (revolute chain + contact listeners)
- `Cannon.ts` (contact-triggered explosions, bullet bodies)

**Batch D — Force-based:**
- `Rocket.ts`, `Balloon.ts`, `Fan.ts` (apply forces per tick via `forEachBodyByLabel`)
- `Dynamite.ts` (timer + explosion), `Conveyor.ts` (pre-solve tangent speed → `b2SurfaceMaterial.tangentSpeed`)

**All prefabs** currently take `planck.World` as first param. Change to `PhysWorld`.

### Phase 4: Tools

16 tool files interact with physics via the `ToolContext` interface. Change `ToolContext.game` to
expose `PhysWorld` instead of `planck.World`. Also migrate `ToolHandler.ts` and `InputManager.ts`.

**Simple tools (type changes only):**
- `SelectTool.ts`, `ScaleTool.ts`, `WaterTool.ts`, `PlatformDrawTool.ts`, `DrawTool.ts`, `CreationTool.ts`

**Medium tools (body queries / destruction):**
- `EraseTool.ts`, `BrushTool.ts`, `SandTool.ts` — body creation/destruction
- `AttachTool.ts`, `DetachTool.ts`, `GlueTool.ts` — joint creation/destruction/iteration
- `RopeTool.ts` — delegates to prefab

**Complex tools:**
- `GrabTool.ts` — MouseJoint. **Box2D v3 has no MouseJoint!** Must be replaced with a MotorJoint. Spike this early to validate feel.
- `AttractTool.ts` — contact listener + force application + weld on contact
- `EndpointDragHandler.ts` — fixture recreation (destroy shape, recreate scaled)

### Phase 5: Water System

`WaterSystem.ts` uses raycasting and AABB queries heavily. box2d3 has different ray/query APIs:
- `world.rayCast()` → `PhysWorld.castRayClosest(origin, translation, filter)`
- `world.queryAABB()` → `PhysWorld.overlapAABB(aabb, filter, callback)`
- Body iteration for buoyancy: `forEachBody` → `physWorld.forEachBody`

### Phase 6: Supporting Files

- `SceneStore.ts` — clean rewrite for new body/shape model. No backward compat needed.
- `RagdollController.ts` — force application, straightforward.
- `SelectionButtons.ts` — body reference, minimal.
- `TiltGravity.ts` — calls `game.setGravityXY()`, no direct planck.
- Test files — rewrite or remove: `Physics.test.ts`, `SceneStore.test.ts`, `Polygon.test.ts`.

## Critical Gotchas

### 1. No MouseJoint in Box2D v3
Box2D v3 removed MouseJoint. The GrabTool must use a MotorJoint (spring-based targeting)
or manual force application to drag bodies. This is the single biggest behavior change.
Spike this early to validate the feel.

### 2. No Fixture-Level UserData
Planck allows per-fixture userData (used for fixture-level fill colors in Renderer).
In box2d3, shapes have no userData. Use body-level fill only (most prefabs already do this).

### 3. Shape Access Pattern
Planck: `for (let f = body.getFixtureList(); f; f = f.getNext())` (linked list)
box2d3: `body.GetShapes()` returns an array

### 4. Joint Anchors
Planck joints expose `getAnchorA()` / `getAnchorB()` returning world-space points.
box2d3 joints use `GetLocalFrameA()` / `GetLocalFrameB()` returning local transforms.
The renderer's joint drawing code needs to transform these to world space manually.

### 5. Event Model
Planck's `world.on("begin-contact", cb)` fires synchronously during `world.step()`.
box2d3's events are polled AFTER `world.Step()`. Code that relies on mid-step contact
handling (Conveyor tangent speed, Cannon contact explosions) needs restructuring.

For Conveyor's pre-solve tangent speed: use `b2SurfaceMaterial.tangentSpeed` (built into box2d3!).

### 6. Async Initialization
`main.ts` must `await initBox2D()` before creating `Game`. This means the entry point
becomes async. Vite handles this fine with top-level await.

## Recommended Order of Work

1. **Phase 1** — Core engine + minimal renderer: Game.ts, Physics.ts, Interpolation.ts, IRenderer.ts, main.ts (4 hours)
2. **Phase 2** — Full Renderer.ts, ThreeJSRenderer.ts, OverlayRenderer.ts (3 hours)
3. **Phase 3A** — Simple prefabs: Ball, Box, Platform, Polygon (1 hour) → **first visual test**
4. **Phase 4 (GrabTool spike)** — GrabTool (MotorJoint replacement) + CreationTool (1 hour) → **first interactive test**
5. **Phase 3B-D** — Remaining 14 prefabs (3 hours)
6. **Phase 4 (rest)** — Remaining 14 tools + ToolHandler + InputManager (3 hours)
7. **Phase 5** — WaterSystem (2 hours)
8. **Phase 6** — SceneStore (clean rewrite), RagdollController, tests (3 hours)

**Total estimated effort:** ~20 hours of focused work, or ~3-4 sessions.

Each phase produces a compilable (though possibly incomplete) build that can be tested.
The goal is to reach "first visual test" (boxes falling, rendered) by end of Phase 3A,
and "first interactive test" (can grab and place boxes) by end of Phase 4 partial.
