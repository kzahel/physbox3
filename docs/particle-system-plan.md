# Particle System Plan (LiquidFun → Box2D v3)

## Goal

Add SPH fluid/particle simulation to PhysBox 3 by porting LiquidFun's particle system into our box2d3-wasm fork. Particles run inside the same WASM module as Box2D v3 — no JS boundary crossings for particle↔rigid body coupling.

## Status

- [x] Clone LiquidFun source into `reference/liquidfun/`
- [x] Fork box2d3-wasm → `kzahel/box2d3-wasm` (branch: `particle-system`)
- [x] Copy LiquidFun particle files into `csrc/particle/`
- [x] Analyze LiquidFun integration points with Box2D v2
- [x] Confirm all needed Box2D v3 flat C APIs exist
- [ ] Create v2→v3 API mapping (detailed, per-function)
- [ ] Port particle system C++ to use v3 APIs
- [ ] Add embind bindings in `glue.cpp`
- [ ] Build and test WASM module
- [ ] Add JS orchestration layer (PhysWorld integration)
- [ ] Add particle rendering
- [ ] Add particle tools (pour, erase, etc.)

## Reference Materials

| Resource | Location | Purpose |
|----------|----------|---------|
| LiquidFun source | `reference/liquidfun/` | Particle system C++ to port |
| LiquidFun particle files | `reference/liquidfun/liquidfun/Box2D/Box2D/Particle/` | Core: `b2ParticleSystem.cpp` (4669 lines), `b2Particle.h` (flags/types) |
| Box2D v3 source | `reference/box2d3-wasm/box2d/src/` | Target engine C source (43 files) |
| Box2D v3 public headers | `reference/box2d3-wasm/box2d/include/box2d/` | `box2d.h` (164 flat API functions), `types.h`, `collision.h`, `math_functions.h` |
| box2d3-wasm glue | `reference/box2d3-wasm/box2d3-wasm/csrc/` | `glue.cpp` (embind), `threading.cpp`, `debugDraw.cpp` |
| box2d3-wasm build scripts | `reference/box2d3-wasm/box2d3-wasm/shell/` | `0_build_makefile.sh`, `1_build_wasm.sh` |
| JS API reference | `docs/box2d3-wasm-reference.md` | Complete embind API docs (1086 lines) |
| Migration plan (Planck→v3) | `docs/migration-plan.md` | Prior v2→v3 migration context |
| Upstream box2d3-wasm | `github.com/Birch-san/box2d3-wasm` | Original repo (v5.2.0) |
| Our fork | `github.com/kzahel/box2d3-wasm` | Fork with particle system additions |

## Architecture

### How LiquidFun integrates with Box2D v2

The particle system is called from `b2World::Step()` **before** the rigid body solve. Each frame:

1. **UpdateContacts()** — spatial hash (tag-sorted proxies) finds particle-particle neighbors
2. **UpdateBodyContacts()** — `world->QueryAABB()` finds nearby fixtures, `fixture->ComputeDistance()` gets distance + normals
3. **ComputeWeight()** — sum contact weights per particle (linear kernel, acts as density)
4. **Force solvers** — pressure, damping, viscous, tensile, elastic, spring, barrier, repulsive, powder, rigid damping, static pressure, wall
5. **SolveCollision()** — raycasts particle trajectories against fixtures for CCD
6. **Position integration** — `pos += dt * vel`

### Box2D v2 → v3 API Mapping

These are the ~250 lines in `b2ParticleSystem.cpp` that touch Box2D internals:

| v2 API (C++ OOP) | v3 API (flat C) | Used in |
|---|---|---|
| `m_world->QueryAABB(&callback, aabb)` | `b2World_OverlapAABB(worldId, aabb, filter, fcn, ctx)` | `UpdateBodyContacts()` |
| `fixture->ComputeDistance(point, &d, &n, child)` | No direct equivalent — use `b2Shape_GetCircle`/`GetPolygon` + manual distance | `UpdateBodyContacts()` |
| `fixture->TestPoint(point)` | `b2Shape_TestPoint(shapeId, point)` | `UpdateBodyContacts()` |
| `fixture->RayCast(&output, input, child)` | `b2Shape_RayCast(shapeId, &input)` | `SolveCollision()` |
| `fixture->GetBody()` | `b2Shape_GetBody(shapeId)` | Throughout |
| `fixture->GetShape()->GetType()` | `b2Shape_GetType(shapeId)` | `SolveCollision()` |
| `fixture->GetAABB(child)` | `b2Shape_GetAABB(shapeId)` | `UpdateBodyContacts()` |
| `body->GetWorldCenter()` | `b2Body_GetWorldCenterOfMass(bodyId)` | Force application |
| `body->GetMass()` | `b2Body_GetMass(bodyId)` | Effective mass calc |
| `body->GetInertia()` | `b2Body_GetRotationalInertia(bodyId)` | Effective mass calc |
| `body->GetLocalCenter()` | `b2Body_GetLocalCenterOfMass(bodyId)` | Inertia adjustment |
| `body->ApplyLinearImpulse(f, p, wake)` | `b2Body_ApplyLinearImpulse(bodyId, f, p, wake)` | Pressure, damping, collision |
| `body->GetLinearVelocityFromWorldPoint(p)` | Manual: `v + cross(omega, p - center)` | Damping, collision |
| `body->m_xf` (transform) | `b2Body_GetTransform(bodyId)` | CCD |
| `body->m_xf0` (prev transform) | Not exposed — need custom tracking | CCD |
| `body->m_type` | `b2Body_GetType(bodyId)` | Type checks |
| `m_world->m_gravity` | `b2World_GetGravity(worldId)` | Gravity |
| `m_world->m_blockAllocator` | `malloc`/`free` or custom arena | Memory |
| `m_world->m_stackAllocator` | `malloc`/`free` or stack buffer | Temp allocations |
| `b2ContactFilter::ShouldCollide()` | `b2QueryFilter` (category/mask bits) | Filtering |

### Key design decisions

1. **Build integration:** Add particle `.c`/`.cpp` files to `1_build_wasm.sh` emcc call (Option B — don't modify Box2D submodule)
2. **Language:** Keep as C++ — glue layer is already C++, no reason to port to C
3. **SIMD:** SOA particle arrays + `-msimd128` (already in build flags). Replace LiquidFun's NEON paths with WASM SIMD intrinsics for hot loops
4. **Memory:** Replace v2 allocators with standard `malloc`/`free` or `std::vector`
5. **Data structures:** Replace `b2GrowableBuffer` with `std::vector`, keep `b2StackQueue` and `b2VoronoiDiagram` (self-contained)
6. **Previous transform (CCD):** Store per-body `b2Transform` snapshots before each step, since v3 doesn't expose `m_xf0`
7. **Embind API:** Expose minimal surface — `createParticleSystem`, `createParticle`, `destroyParticle`, `getPositionBuffer` (typed array view for zero-copy rendering), `getColorBuffer`, step is called internally alongside `world.Step()`

### Files to create/modify in box2d3-wasm fork

```
csrc/particle/              ← LiquidFun particle files (copied, then modified)
  b2Particle.h/cpp          ← Flags, defs (minimal changes — remove v2 includes)
  b2ParticleGroup.h/cpp     ← Group management (moderate changes — v2 body/fixture refs)
  b2ParticleSystem.h/cpp    ← Core solver (main porting work — ~250 lines of v2 API calls)
  b2StackQueue.h            ← Self-contained, no changes
  b2VoronoiDiagram.h/cpp    ← Self-contained, minimal changes (v2 math → v3 math)
  b2ParticleAssembly.*      ← NEON SIMD — replace with WASM SIMD or remove (auto-vectorize)
csrc/glue.cpp               ← Add embind bindings for particle API
shell/1_build_wasm.sh       ← Add particle .cpp files to emcc invocation
```

## Phase Plan

### Phase 1: Compile
Get the particle files compiling against v3 headers. Stub out v2 dependencies, replace includes, get a clean build. No functionality yet.

### Phase 2: Core solver
Port the v2 API calls in `b2ParticleSystem.cpp` to v3 equivalents. Focus on: spatial hash (self-contained), particle-particle contacts, pressure/damping solvers, position integration. Skip particle-body coupling initially — just get particles interacting with each other.

### Phase 3: Rigid body coupling
Port `UpdateBodyContacts()` and `SolveCollision()` — the particle↔rigid body interaction. Implement `ComputeDistance` equivalent using v3 shape queries. Handle CCD with transform snapshots.

### Phase 4: Embind + JS integration
Add embind bindings. Wire into PhysWorld step loop. Add rendering (instanced circles or point sprites). Add a pour/liquid tool.

### Phase 5: Polish
SIMD optimization for hot loops. Particle groups (rigid, elastic). Sand/powder behavior. Surface tension tuning. Performance profiling.
