import type { Game } from "../../engine/Game";
import type { Tool, ToolContext, ToolHandler } from "../ToolHandler";

interface DrawParams {
  start: { x: number; y: number };
  cx: number;
  cy: number;
  len: number;
  angle: number;
}

type PlatformCreator = (game: Game, p: DrawParams) => void;

const PLATFORM_CREATORS: Partial<Record<Tool, PlatformCreator>> = {
  conveyor: (game, p) => game.addConveyor(p.cx, p.cy, p.len, 3, p.angle),
  fan: (game, p) => game.addFan(p.start.x, p.start.y, p.angle),
  cannon: (game, p) => game.addCannon(p.start.x, p.start.y, p.angle),
  rocket: (game, p) => game.addRocket(p.start.x, p.start.y, p.angle - Math.PI / 2),
};

const DEFAULT_CREATOR: PlatformCreator = (game, p) => game.addPlatform(p.cx, p.cy, p.len, p.angle);

/** Shared handler for tools that use a drag-to-draw gesture: platform, conveyor, fan, cannon, rocket */
export class PlatformDrawTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "drag" as const;
  /** Visible to Renderer for preview line */
  platformDraw: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
  private ctx: ToolContext;
  private creator: PlatformCreator;

  constructor(ctx: ToolContext, variant: Tool) {
    this.ctx = ctx;
    this.creator = PLATFORM_CREATORS[variant] ?? DEFAULT_CREATOR;
  }

  onDown(wx: number, wy: number) {
    this.platformDraw = { start: { x: wx, y: wy }, end: { x: wx, y: wy } };
  }

  onMove(wx: number, wy: number) {
    if (this.platformDraw) {
      this.platformDraw.end = { x: wx, y: wy };
    }
  }

  onUp() {
    this.finishDraw();
  }

  reset() {
    this.platformDraw = null;
  }

  private finishDraw() {
    if (!this.platformDraw) return;
    const { start, end } = this.platformDraw;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.3 && !this.ctx.game.pw.isFull) {
      this.creator(this.ctx.game, {
        start,
        cx: (start.x + end.x) / 2,
        cy: (start.y + end.y) / 2,
        len,
        angle: Math.atan2(dy, dx),
      });
    }
    this.platformDraw = null;
  }
}
