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
| UserData | `body.setUserData({fill, label})` | None — external `Map<Body, BodyUserData>` |
| Body iteration | `world.getBodyList()` linked list | None — must track bodies ourselves |
| Joint iteration | `world.getJointList()` linked list | None — must track joints ourselves |
| Events | Callbacks: `world.on("begin-contact", cb)` | Polled: `world.GetContactEvents()` after Step |
| Vec2 creation | `planck.Vec2(x, y)` (factory) | `new B2.b2Vec2(x, y)` (constructor) |
| World step | `world.step(dt, velIter, posIter)` | `world.Step(dt, subSteps)` |
| Shapes | `planck.Circle(r)`, `planck.Box(w,h)` | `new B2.b2Circle()`, `B2.b2MakeBox(w,h)` |
| Shape types | `shape.getType() === "circle"` | Enum: `B2.b2ShapeType.b2_circleShape` |
| Module init | Synchronous `import * as planck` | Async `await Box2DFactory()` |
| Memory | JS GC | Mostly GC via OOP wrapper, explicit `Destroy()` for world/body/joint |

## What's Already Done

- [x] `box2d3-wasm` installed, `planck` removed from dependencies
- [x] `src/engine/Box2D.ts` — async WASM module singleton (`initBox2D()`, `b2()`)
- [x] `src/engine/PhysWorld.ts` — World wrapper with body/joint tracking, external userData, event polling
- [x] `src/box2d3-wasm.d.ts` — type declarations bridging ESM/WASM module
- [x] `tsconfig.json` — `paths` alias for `box2d3` types
- [x] `vite.config.ts` — COOP/COEP headers for SharedArrayBuffer, WASM exclusion from optimizeDeps
- [x] `src/engine/BodyUserData.ts` — partially migrated (imports box2d3 Body type, `getBodyUserData` takes `PhysWorld`)

## Migration Strategy: Compatibility Wrapper

Rather than rewriting all 46 files at once, introduce a **compatibility layer** that wraps
box2d3-wasm objects with a Planck-like API. This lets us migrate incrementally — the wrapper
handles the translation so consumer code (prefabs, tools) can be migrated file-by-file or even
deferred.

### Phase 0: Compatibility Types (do first)

Create `src/engine/Compat.ts` that provides Planck-like interfaces backed by box2d3:

```typescript
// Types that look like Planck but wrap box2d3 objects
import type { Body, Joint, Shape, b2Vec2 } from "box2d3";

// Simple re-exports / aliases
export type PBody = Body;      // body.GetPosition() instead of body.getPosition()
export type PJoint = Joint;
export type PShape = Shape;

// Vec2 helper that mimics planck.Vec2 factory
export function Vec2(x: number, y: number): b2Vec2 { ... }

// Body helper that reads userData from PhysWorld
export function getPosition(body: Body): {x: number, y: number} { ... }
export function getAngle(body: Body): number { ... }
export function isDynamic(body: Body): boolean { ... }
```

**Why this helps:** Most consumer code just needs `body.getPosition()` → `body.GetPosition()`,
`body.getAngle()` → `body.GetRotation().GetAngle()`, etc. A thin adapter avoids touching
every call site immediately.

### Phase 1: Core Engine (must be done together)

These files form the physics backbone and must be migrated as a unit:

| File | Lines | Complexity | Notes |
|------|-------|------------|-------|
| `Game.ts` | ~110 | HIGH | World creation, stepping, collision events, gravity, prefab delegates |
| `Physics.ts` | ~170 | HIGH | Body queries, AABB, explosions, scaling, joint creation, iteration |
| `Interpolation.ts` | ~70 | LOW | Just needs Body type change + method renames |
| `IRenderer.ts` | ~20 | LOW | Interface — change `planck.World` param to `PhysWorld` |
| `main.ts` | ~140 | LOW | Add `await initBox2D()` before `new Game()` |

**Key decisions:**
- `Game.ts` owns a `PhysWorld` instead of `planck.World`
- All `forEachBody(world, cb)` → `physWorld.forEachBody(cb)`
- Collision sounds: switch from `world.on("post-solve")` to hit events with `physWorld.onHit()`
- Bounciness: switch from `world.on("pre-solve")` to `world.SetRestitutionThreshold()` or pre-solve callback
- Explosion: box2d3 has built-in `b2World_Explode()` — can replace our manual radial impulse

**Estimated effort:** ~4 hours

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
- Joint rendering: `world.getJointList()` → `physWorld.forEachJoint(cb)`. Joint anchors may differ.
- No `fixture.getUserData()` — fixture/shape-level styles need an alternative (body-level or shape map)

**Estimated effort:** ~3 hours

### Phase 3: Prefabs (can be done in parallel batches)

All 17 prefab files follow the same pattern: create bodies, add shapes, set userData, create joints.

**Batch A — Simple (body + shape only):**
- `Ball.ts`, `Box.ts`, `Platform.ts` (~5 lines each)
- Mechanical translation: `createBody()` + `createFixture()` → `pw.createBody()` + `body.CreateCircleShape()`

**Batch B — Joints:**
- `Seesaw.ts` (revolute), `SpringBall.ts` (distance), `Launcher.ts` (prismatic + weld)
- Need joint creation via flat API: `B2.b2CreateRevoluteJoint(worldId, def)`

**Batch C — Complex:**
- `Car.ts` (wheel joints), `Train.ts` (wheel joints, multi-body)
- `Rope.ts` (~120 lines, revolute chains + rope stabilizers)
- `Ragdoll.ts` (revolute chain + contact listeners)
- `Cannon.ts` (contact-triggered explosions, bullet bodies)

**Batch D — Force-based:**
- `Rocket.ts`, `Balloon.ts`, `Fan.ts` (apply forces per tick via `forEachBodyByLabel`)
- `Dynamite.ts` (timer + explosion), `Conveyor.ts` (pre-solve tangent speed)

**All prefabs** currently take `planck.World` as first param. Change to `PhysWorld`.

**Estimated effort:** ~4 hours (2 for simple, 2 for complex)

### Phase 4: Tools

Tools interact with physics via the `ToolContext` interface. Change `ToolContext.game` to
expose `PhysWorld` instead of `planck.World`.

**Simple tools (type changes only):**
- `SelectTool.ts`, `ScaleTool.ts`, `WaterTool.ts`, `PlatformDrawTool.ts`, `DrawTool.ts`, `CreationTool.ts`

**Medium tools (body queries / destruction):**
- `EraseTool.ts`, `BrushTool.ts`, `SandTool.ts` — body creation/destruction
- `AttachTool.ts`, `DetachTool.ts`, `GlueTool.ts` — joint creation/destruction/iteration
- `RopeTool.ts` — delegates to prefab

**Complex tools:**
- `GrabTool.ts` — MouseJoint. **Box2D v3 has no MouseJoint!** Must be replaced with a MotorJoint or manual force application.
- `AttractTool.ts` — contact listener + force application + weld on contact
- `EndpointDragHandler.ts` — fixture recreation (destroy shape, recreate scaled)

**Estimated effort:** ~4 hours

### Phase 5: Water System

`WaterSystem.ts` uses raycasting and AABB queries heavily. box2d3 has different ray/query APIs:
- `world.rayCast()` → `B2.b2World_CastRayClosest(worldId, origin, translation, filter)`
- `world.queryAABB()` → `B2.b2World_OverlapAABB(worldId, aabb, filter, callback)`
- Body iteration for buoyancy: `forEachBody` → `physWorld.forEachBody`

**Estimated effort:** ~2 hours

### Phase 6: Supporting Files

- `SceneStore.ts` — scene save/load serialization. Needs full rework for new body/shape model.
- `RagdollController.ts` — force application, straightforward.
- `SelectionButtons.ts` — body reference, minimal.
- `TiltGravity.ts` — calls `game.setGravityXY()`, no direct planck.
- Test files (3) — update or remove.

**Estimated effort:** ~2 hours

## Critical Gotchas

### 1. No MouseJoint in Box2D v3
Box2D v3 removed MouseJoint. The GrabTool must use a MotorJoint (spring-based targeting)
or manual force application to drag bodies. This is the single biggest behavior change.

### 2. No Fixture-Level UserData
Planck allows per-fixture userData (used for fixture-level fill colors in Renderer).
In box2d3, shapes have no userData. Options:
- Store shape styles in a Map<Shape, FixtureStyle> on PhysWorld
- Or simplify: use body-level fill only (most prefabs already do this)

### 3. Shape Access Pattern
Planck: `for (let f = body.getFixtureList(); f; f = f.getNext())` (linked list)
box2d3: `body.GetShapes()` returns an array (likely need to call with capacity)

### 4. Joint Anchors
Planck joints expose `getAnchorA()` / `getAnchorB()` returning world-space points.
box2d3 joints use `GetLocalFrameA()` / `GetLocalFrameB()` returning local transforms.
The renderer's joint drawing code needs to transform these to world space manually.

### 5. Event Model
Planck's `world.on("begin-contact", cb)` fires synchronously during `world.step()`.
box2d3's events are polled AFTER `world.Step()`. Code that relies on mid-step contact
handling (Conveyor tangent speed, Cannon contact explosions) needs restructuring.

For Conveyor's pre-solve tangent speed: use `b2World_SetPreSolveCallback` or
`b2SurfaceMaterial.tangentSpeed` (built into box2d3!).

### 6. Async Initialization
`main.ts` must `await initBox2D()` before creating `Game`. This means the entry point
becomes async. Vite handles this fine with top-level await.

## Recommended Order of Work

1. **Phase 0** — Compat types + Vec2 helpers (30 min)
2. **Phase 1** — Core engine: Game.ts, Physics.ts, Interpolation.ts, IRenderer.ts, main.ts (4 hours)
3. **Phase 2** — Renderer.ts (get something rendering) (2 hours)
4. **Phase 3A** — Simple prefabs: Ball, Box, Platform (1 hour) → **first visual test**
5. **Phase 4 (partial)** — GrabTool (MotorJoint replacement) + CreationTool (1 hour) → **first interactive test**
6. **Phase 3B-D** — Remaining prefabs (3 hours)
7. **Phase 4 (rest)** — Remaining tools (3 hours)
8. **Phase 5** — WaterSystem (2 hours)
9. **Phase 6** — SceneStore, tests, cleanup (2 hours)

**Total estimated effort:** ~18-20 hours of focused work, or ~3-4 sessions.

Each phase produces a compilable (though possibly incomplete) build that can be tested.
The goal is to reach "first visual test" (boxes falling, rendered) by end of Phase 3A,
and "first interactive test" (can grab and place boxes) by end of Phase 4 partial.
