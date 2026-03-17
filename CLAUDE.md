# PhysBox 3

2D physics sandbox. Migrating from Planck.js (Box2D v2.4) to box2d3-wasm (Box2D v3, WASM+SIMD).

## Status: MIGRATION IN PROGRESS — Phase 1 Complete

See `docs/migration-plan.md` for the full plan and `docs/box2d3-wasm-reference.md` for the complete API reference.

**Phase 1 done:** Game.ts, Physics.ts, Interpolation.ts, IRenderer.ts, main.ts — all migrated, 0 TS errors.
**Next:** Phase 2 (Renderers), then Phase 3A (simple prefabs) for first visual test.
**Remaining errors:** 176 TS errors in unmigrated files (prefabs, tools, renderers still import planck).

## Build & Dev

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — biome check (formatting + linting)
- `npx tsc --noEmit` — type check (176 errors remain in unmigrated files)

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
- `src/engine/Renderer.ts` — canvas rendering (needs migration)
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
- Body/joint iteration via `PhysWorld.forEachBody()` / `forEachJoint()` (tracked Set)
- Events polled after `world.Step()` via `PhysWorld.processEvents()`
- No MouseJoint in v3 — use MotorJoint for grab tool

### Critical: ID arrays vs OOP wrappers

- `body.GetShapes()` returns **`b2ShapeId[]`** (plain ID structs), NOT `Shape[]` OOP wrappers. Use flat API: `b2Shape_GetType(id)`, `b2Shape_GetCircle(id)`, `b2Shape_TestPoint(id, point)`, etc.
- `body.GetJoints()` returns **`b2JointId[]`** (plain ID structs), NOT `Joint[]` OOP wrappers. Use flat API: `b2Joint_GetType(id)`, `b2Joint_GetBodyA(id)`, etc.
- `body.GetPointer()` / `world.GetPointer()` return internal indices usable with flat API functions that expect ID types.

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
