# Particle System MVP Plan

## Goal

Add a fast, kid-friendly particle fluid demo to PhysBox 3 by building a **narrow particle sidecar** inside the same WASM module as Box2D v3.

The sidecar should:
- keep particle simulation and rigid-body coupling inside WASM
- expose a small JS API suitable for the sandbox game
- use LiquidFun as an **algorithm and test reference**, not as an API compatibility target
- preserve a thin boundary between the particle solver and Box2D v3 so the `box2d3-wasm` fork stays maintainable

This is an **MVP plan**, not a full LiquidFun port plan.

## Summary

Recommended approach:
- keep the solver in C++
- keep Box2D v3 integration in a small handwritten bridge layer
- port only the subset of LiquidFun needed for a convincing water/fluid demo
- defer old LiquidFun features that expand API surface or coupling complexity

Working mental model:
- `LiquidFun-derived solver core`
- `thin Box2D v3 bridge`
- `minimal embind / JS sandbox API`

## Current Status

Implemented baseline as of the current repo state:
- fork-side particle code lives under `reference/box2d3-wasm/box2d3-wasm/csrc/particle_sidecar/`
- `glue.cpp` and `shell/1_build_wasm.sh` are wired to build and expose the sidecar
- the sidecar has a minimal `ParticleSystem` with:
  - create / destroy
  - particle count
  - zero-copy position buffer
  - circle-batch spawning
  - neighbor broadphase and particle-particle contact generation
  - reduced pressure relaxation and pair damping
  - gravity integration
  - rigid-body collision projection and impulse application
- the Box2D bridge currently covers:
  - world gravity
  - AABB shape query
  - supported shape contact helper
  - body point velocity
  - body impulse application
- the main app is already wired to exercise this path:
  - `Fluid` tool spawns WASM particles
  - particles step during the normal physics loop
  - particles render in both 2D and 3D renderers
  - default fluid bursts are tuned slightly denser so the reduced solver reads more clearly

What this means in practice:
- Phase 1 is complete
- Phase 2 is complete in reduced-MVP form
- early Box2D bridge work from later phases is complete enough for visual demos
- the current result is **basic fluid-like particle motion with rigid-body collision**, not yet a polished water solver

Still missing for the MVP goal:
- erase path for WASM particles
- combined single-WASM orchestration path
- bridge-focused tests and scenario tests
- further tuning if the demo still needs more convincing water feel in sandbox scenes

## Scope

### In scope for MVP

- one particle system per world to start
- water-like particle behavior
- particle-particle contacts and pressure/damping solve
- particle-rigid-body collision and impulse coupling
- basic confinement against world geometry
- particle spawn tool for the sandbox
- particle erase tool for the sandbox
- zero-copy read access to particle render buffers from JS
- deterministic-enough fixed-step behavior for demos and tests

### Explicitly deferred

- previous-transform CCD snapshots (`m_xf0` equivalent)
- full LiquidFun API compatibility
- particle groups
- rigid particle groups
- elastic / spring groups
- barrier / wall specialized behavior unless needed for MVP scenes
- lifetimes
- particle handles / persistence semantics
- custom particle listeners and filters
- JS-side per-particle callbacks
- major SOA memory-layout rewrite
- manual WASM SIMD intrinsics work

## Why This Plan

This plan optimizes for:
- shortest path to a playable sandbox demo
- good enough performance from keeping all hot coupling inside WASM
- low maintenance burden when upstream Box2D v3 changes
- freedom to diverge from LiquidFun internals later

This plan does **not** optimize for:
- preserving LiquidFun's old public API
- shipping every particle mode immediately
- exact parity with legacy tests and semantics

## Key References

### Project docs

| Resource | Location | Why it matters |
|---|---|---|
| Project conventions | `CLAUDE.md` | Repo architecture, engine patterns, box2d3-wasm usage |
| box2d3-wasm JS API | `docs/box2d3-wasm-reference.md` | Embind surface and exposed flat C helpers |
| Historical full-scope plan | `docs/particle-system-plan.md` | Prior full LiquidFun-port analysis and v2→v3 mapping notes |
| Prior migration notes | `docs/migration-plan.md` | Earlier v2→v3 context and repo conventions |

### LiquidFun source

| Resource | Location | Why it matters |
|---|---|---|
| Core solver | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/b2ParticleSystem.cpp` | Main particle solver logic to reuse selectively |
| Particle types / flags | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/b2Particle.h` | Flags, defs, handle semantics, particle terminology |
| Particle groups | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/b2ParticleGroup.h` | Useful later, not MVP |
| Group implementation | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/b2ParticleGroup.cpp` | Useful later, not MVP |
| Voronoi helper | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/b2VoronoiDiagram.cpp` | Later if elastic/spring features return |
| Unit test harness | `reference/liquidfun/liquidfun/Box2D/Unittests/README` | Baseline-based simulation test pattern |
| Particle API tests | `reference/liquidfun/liquidfun/Box2D/Unittests/Function/FunctionTests.cpp` | Behavior oracle for selected features |
| Particle/body tests | `reference/liquidfun/liquidfun/Box2D/Unittests/BodyContacts/BodyContactsTests.cpp` | Contact and collision behavior oracle |
| Confinement tests | `reference/liquidfun/liquidfun/Box2D/Unittests/Confinement/ConfinementTests.cpp` | Shape-boundary scenarios |
| Determinism-ish tests | `reference/liquidfun/liquidfun/Box2D/Unittests/Multi/MultipleParticleSystemsTests.cpp` | Useful reference for repeatable stepping |
| Testbed scenarios | `reference/liquidfun/liquidfun/Box2D/Testbed/Tests/` | Visual scenarios like `DamBreak`, `Faucet`, `Soup`, `WaveMachine` |

### Box2D v3 / box2d3-wasm source

| Resource | Location | Why it matters |
|---|---|---|
| Public flat C API | `reference/box2d3-wasm/box2d/include/box2d/box2d.h` | World/body/shape functions the bridge will call |
| Geometry / distance API | `reference/box2d3-wasm/box2d/include/box2d/collision.h` | `b2ShapeDistance`, proxies, shape cast, TOI helpers |
| Types / callback contracts | `reference/box2d3-wasm/box2d/include/box2d/types.h` | IDs, callback threading rules, event structs |
| World step internals | `reference/box2d3-wasm/box2d/src/physics_world.c` | Locking and step-order behavior |
| Embind bindings | `reference/box2d3-wasm/box2d3-wasm/csrc/glue.cpp` | Existing JS binding patterns and typed-array exposure |
| WASM build script | `reference/box2d3-wasm/box2d3-wasm/shell/1_build_wasm.sh` | Build integration point |

## Architecture

### Design target

Keep three layers:

1. **Solver core**
   - derived from LiquidFun code where useful
   - owns particle buffers and solver passes
   - does not directly depend on Box2D v3 internals outside a narrow bridge

2. **Box2D bridge**
   - the only layer that knows `b2WorldId`, `b2BodyId`, `b2ShapeId`, and the flat C API
   - provides shape queries, closest-point/contact helpers, body impulse helpers, gravity, and step integration

3. **JS / embind API**
   - small sandbox-facing control surface
   - exposes render buffers and creation/erase operations
   - does not expose LiquidFun's legacy API wholesale

### Why a sidecar, not a full engine merge

The sidecar model keeps the dependency direction clean:
- Box2D v3 stays the rigid-body engine
- the particle solver asks the bridge for rigid-body interactions
- the bridge adapts only public Box2D v3 APIs

That makes future upstream Box2D updates much easier than scattering flat-C rewrites throughout a large LiquidFun port.

## Boundary Contract

Define a small internal bridge API first. The exact names can change, but the responsibilities should stay narrow.

### World / step

- `BeginParticleStep(worldId, dt)`
- `EndParticleStep(worldId)`
- `GetGravity(worldId)`

`BeginParticleStep` should be where any future body-transform snapshots would live. MVP can leave snapshot-based CCD disabled.

### Shape query / contact helpers

- `QueryShapesInAABB(worldId, aabb, callback)`
- `ComputeParticleShapeContact(shapeId, point, particleRadius, outContact)`
- `RayCastShape(shapeId, origin, translation)`

`ComputeParticleShapeContact` is the key helper. For MVP it should support:
- circle
- polygon
- capsule
- segment
- chain segment if the sandbox uses chains for terrain / boundaries

Use v3 shape accessors and closest-point helpers from:
- `b2Shape_GetCircle`
- `b2Shape_GetPolygon`
- `b2Shape_GetCapsule`
- `b2Shape_GetSegment`
- `b2Shape_GetChainSegment`
- `b2Shape_GetClosestPoint`
- `b2Shape_TestPoint`

Only pull in `b2ShapeDistance` if it simplifies a specific supported shape path. Do not build a giant generic geometry layer before the MVP works.

### Body helpers

- `GetShapeBody(shapeId)`
- `GetBodyType(bodyId)`
- `GetBodyMass(bodyId)`
- `GetBodyRotationalInertia(bodyId)`
- `GetBodyWorldCenterOfMass(bodyId)`
- `GetBodyWorldPointVelocity(bodyId, point)`
- `ApplyBodyLinearImpulse(bodyId, impulse, point, wake)`

Prefer the direct v3 helpers where they already exist instead of re-deriving values manually.

## MVP Solver Feature Set

### Keep

- particle creation / deletion
- position, velocity, flags, optional color buffers
- broadphase proxy update / sort
- particle-particle contact generation
- pressure
- damping
- viscous force if needed for feel
- body contact generation
- body impulse coupling
- position integration

### Remove or stub initially

- groups
- pair / triad features used only by non-MVP particle modes
- lifetime and handle bookkeeping
- contact listeners / destruction listeners
- custom particle filters
- strict-contact extras unless a testbed scene proves they are necessary
- solver passes tied to deferred flags

This should be a **reduced LiquidFun-derived solver**, not a line-for-line port.

## JS API

Expose only what the sandbox needs.

### Suggested embind surface

- `createParticleSystem(world, def)`
- `destroyParticleSystem(system)`
- `stepParticleSystem(system, dt)` only if internal combined stepping is not ready
- preferably `stepWorldWithParticles(world, dt, substeps)`
- `spawnParticlesInCircle(system, center, radius, options)`
- `spawnParticlesInBox(system, center, halfExtents, options)`
- `destroyParticlesInCircle(system, center, radius)`
- `getParticleCount(system)`
- `getParticleCapacity(system)`
- `getPositionBuffer(system)`
- `getColorBuffer(system)`

Optional for tooling:
- `setParticleTint(system, color)`
- `clearParticles(system)`

### API rules

- indices are **ephemeral**
- JS should not treat particle indices as stable identities
- typed-array views must be reacquired after capacity changes or memory growth
- no JS callback hooks in the hot path

## Testing Plan

Do not try to import every LiquidFun test. Build a smaller test set around the new boundary and selected scene behavior.

### 1. Bridge contract tests

Write focused tests for:
- closest point / contact normal on supported shape types
- shape overlap query results for known scenes
- body point velocity helper
- impulse application to bodies

These tests are the most valuable long-term protection for future solver rewrites and a later SOA redesign.

### 2. Solver behavior tests

Write deterministic fixed-step tests for:
- particle spawn / erase / count
- particles settling in a static box
- dam-break style box release
- particle-body collision in simple scenes
- confinement against representative world geometry

Where possible, borrow scene setups from:
- `DamBreak`
- `Faucet`
- `Soup`
- `WaveMachine`
- `ConfinementTests`

### 3. Tolerance-based baseline tests

Use a smaller version of LiquidFun's baseline idea:
- record particle count
- sample bounds / centroid / average speed
- sample a few rigid-body positions

Do not require exact float identity. Use tolerances.

This is enough to catch major regressions while leaving room for refactors.

### 4. JS integration tests

Verify:
- buffers are readable after stepping
- buffer reacquire after growth works
- spawn / erase tools do not desync UI and solver state

## Performance Strategy

### For MVP

Primary wins come from:
- all particle-body coupling staying inside WASM
- all particle stepping staying inside WASM
- JS reading contiguous render buffers only

That should be good enough for an MVP.

### Explicitly not MVP work

- full SOA redesign
- hand-written WASM SIMD intrinsics
- micro-optimizing every LiquidFun pass before profiling

### Later SOA redesign

If profiling later shows the solver is bottlenecked by memory layout, do a dedicated SOA pass then.

Expected future shape of that work:
- preserve the bridge contract
- preserve the JS API
- preserve behavior within test tolerances
- accept that floating-point accumulation order may change slightly

The refactor should be treated as **behavior-preserving within tolerances**, not as exact bitwise equivalence.

## Implementation Plan

### Phase 0: Lock the boundary

- define the sidecar architecture and bridge responsibilities
- define the reduced MVP feature set
- define the JS API and test plan

Deliverable:
- this plan

### Phase 1: Build skeleton

- add particle source files to the `box2d3-wasm` fork build
- create a new particle-sidecar namespace / module layout
- compile a minimal particle system object with empty stepping
- add placeholder embind bindings

Deliverable:
- builds in both target WASM flavors you intend to support

Status:
- complete
- implemented as `particle_sidecar/` rather than `csrc/particle/`

### Phase 2: Core particle solver

- port or reimplement the minimum LiquidFun passes for:
  - particle creation / deletion
  - proxy update / sort
  - particle-particle contacts
  - pressure / damping
  - integration

No rigid-body coupling yet.

Deliverable:
- particles move and settle in isolation

Status:
- complete in reduced-MVP form
- particle creation, zero-copy positions, broadphase/contact generation, reduced pressure / damping, and integration exist

### Phase 3: Box2D bridge

- implement world overlap query path
- implement supported shape contact helper
- implement supported body helper functions
- add body impulse coupling

Deliverable:
- particles collide with rigid bodies and push them

Status:
- partially complete
- supported shape contact helpers, body impulse coupling, and rigid-body collision projection already exist for the reduced demo path

### Phase 4: Combined step path

- add a single internal step path that runs particles and world in the intended order
- keep the orchestration inside WASM
- document any temporary CCD limitations from deferred snapshots

Deliverable:
- one stable stepping entry point for the sandbox

Status:
- not complete
- particles are currently stepped from the app loop before `pw.step(...)`, not from one internal WASM-owned combined step path

### Phase 5: Sandbox integration

- wire the new API into `PhysWorld`
- add a simple pour/spawn tool
- add erase tool
- render particles from zero-copy buffers

Deliverable:
- playable in the main sandbox

Status:
- partially complete
- the app has a `Fluid` tool and renderer integration
- current experience is for visual exercise/testing, not yet a convincing water sandbox

### Phase 6: Harden and profile

- add bridge tests and scenario tests
- measure particle count limits on representative devices
- tune parameters for feel
- decide whether later work needs:
  - strict-contact improvements
  - more particle modes
  - SOA redesign

## Files Expected To Change

### In the `box2d3-wasm` fork

- `reference/box2d3-wasm/box2d3-wasm/csrc/glue.cpp`
- `reference/box2d3-wasm/box2d3-wasm/shell/1_build_wasm.sh`
- new particle-sidecar sources under `reference/box2d3-wasm/box2d3-wasm/csrc/particle_sidecar/`

### In PhysBox 3

- `src/engine/Box2D.ts`
- `src/engine/PhysWorld.ts`
- renderer integration files
- input/tool files for spawn and erase interactions

## Decision Log

### Keep

- C++ implementation
- build integration in `box2d3-wasm` glue/build layer instead of editing the Box2D v3 submodule
- same-WASM-module architecture for performance

### Defer

- previous-transform snapshots
- full LiquidFun parity
- full legacy particle flags and callbacks
- large memory-layout rewrite

### Treat as historical background only

- the older full-port plan in `docs/particle-system-plan.md`

That document is still useful reference material, but it should not drive MVP scope.
