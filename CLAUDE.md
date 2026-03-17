# PhysBox 3

2D physics sandbox. Migrating from Planck.js (Box2D v2.4) to box2d3-wasm (Box2D v3, WASM+SIMD).

## Status: MIGRATION IN PROGRESS

See `docs/migration-plan.md` for the full plan. Currently in early Phase 0/1.

**What works:** Type declarations, Box2D WASM init singleton, PhysWorld wrapper.
**What doesn't:** Everything else — the codebase still has planck imports everywhere.

## Build & Dev

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — biome check (formatting + linting)
- `npx tsc --noEmit` — type check (currently fails — 46 files still import planck)

## Architecture

- `src/engine/Box2D.ts` — WASM module singleton (async init)
- `src/engine/PhysWorld.ts` — World wrapper (body/joint tracking, userData, events)
- `src/engine/Game.ts` — game loop, prefab delegates (needs migration)
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
