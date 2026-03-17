# PhysBox 2

2D physics sandbox built with Planck.js (Box2D), TypeScript, Vite, Canvas 2D.

## Build & Dev

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run lint` — biome check (formatting + linting)
- `npx tsc --noEmit` — type check

## Architecture

- `src/engine/Game.ts` — physics world, body creation helpers, game loop
- `src/engine/Renderer.ts` — canvas rendering (bodies, joints, tool cursors)
- `src/engine/Camera.ts` — world/screen coordinate transforms, zoom, pan
- `src/interaction/InputManager.ts` — input handling, tool logic, mouse + touch events
- `src/ui/Toolbar.ts` — tool selection buttons + keyboard shortcuts
- `src/ui/SettingsPane.ts` — settings sidebar (gravity, speed, clear, pause, fullscreen)

## Key Conventions

### Mobile / Touch is First Class

Every interaction must work on touch devices. Mouse-specific interactions (hover, right-click, middle-click) are fine as extras, but every tool and feature must have a touch-equivalent path. When adding new tools or interactions:

- Always handle touch events (`touchstart`, `touchmove`, `touchend`) alongside mouse events
- Single-finger tap/drag = primary tool action
- Two-finger gestures = pan + pinch zoom (always available, releases any active tool)
- Test that tool cursors and visual feedback work with touch coordinates
- Touch events fire on tap-end for creation tools (box, ball, platform, rope) to avoid conflicts with pan detection

### Tools

Tools are defined by: adding to the `Tool` union type in InputManager.ts, adding to the `TOOLS` array in Toolbar.ts, handling in InputManager mouse/touch event methods, and optionally adding cursor visuals in Renderer.ts.

### Physics

- Planck.js world with Y-up coordinate system
- Joint types in use: MouseJoint (grab), RevoluteJoint (ropes), WeldJoint (attach)
- Bodies store style via `setUserData({ fill, label })`

### Workflow

- After completing any feature change, commit and push immediately without waiting to be asked.
