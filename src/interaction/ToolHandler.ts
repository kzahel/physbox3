import type { Body } from "box2d3";
import type { Game } from "../engine/Game";

/** Shared context passed to every tool handler */
export interface ToolContext {
  game: Game;
  groundBody: Body;
  /** Find the nearest body at world coords within a screen-pixel radius */
  findBodyAt(wx: number, wy: number, radiusPx?: number): Body | null;
}

/**
 * Interface that every tool implements. InputManager dispatches DOM events
 * to whichever ToolHandler is currently active.
 */
export interface ToolHandler {
  /** Called on mouse-down / single-finger touch-start (grab only) or touch-end tap */
  onDown?(wx: number, wy: number, screenX: number, screenY: number): void;

  /** Called on mouse-move / single-finger touch-move while primary button held */
  onMove?(wx: number, wy: number, dx: number, dy: number, screenX: number, screenY: number): void;

  /** Called on mouse-up / touch-end */
  onUp?(): void;

  /** Called continuously while dragging for brush-style tools (erase, glue, unglue) */
  onBrush?(wx: number, wy: number, screenX: number, screenY: number): void;

  /** Whether this tool supports multi-place (hold to spam) */
  isCreationTool?: boolean;

  /** If true, touch-start fires onDown immediately (grab, scale, draw, platform, brush tools) */
  immediateTouch?: boolean;

  /** Touch-move behavior: 'drag' calls onMove, 'brush' calls onBrush. Undefined = no touch-drag */
  touchDragMode?: "drag" | "brush";

  /** Clean up any pending state when switching away from this tool */
  reset?(): void;
}

/** State exposed by InputManager to renderers for drawing tool overlays */
export interface ToolRenderInfo {
  readonly tool: Tool;
  readonly toolCursor: { x: number; y: number } | null;
  readonly selectedBody: Body | null;
  readonly attachPending: { body: Body; world: { x: number; y: number } } | null;
  readonly ropePending: { body: Body | null; x: number; y: number } | null;
  readonly scaleDrag: { body: Body; startScreenY: number; currentScale: number } | null;
  readonly platformDraw: { start: { x: number; y: number }; end: { x: number; y: number } } | null;
  readonly drawPoints: readonly { x: number; y: number }[];
}

export type Tool =
  | "box"
  | "ball"
  | "platform"
  | "car"
  | "springball"
  | "launcher"
  | "conveyor"
  | "dynamite"
  | "ropetool"
  | "spring"
  | "grab"
  | "erase"
  | "attach"
  | "detach"
  | "attract"
  | "select"
  | "seesaw"
  | "rocket"
  | "scale"
  | "balloon"
  | "fan"
  | "ragdoll"
  | "cannon"
  | "glue"
  | "unglue"
  | "train"
  | "draw"
  | "water"
  | "sand";
