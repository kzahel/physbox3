import { distance } from "../../engine/Physics";
import { createTerrain } from "../../prefabs/Terrain";
import type { ToolContext, ToolHandler } from "../ToolHandler";

export class TerrainTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "drag" as const;
  /** Points collected while drawing — visible to Renderer for preview */
  terrainPoints: { x: number; y: number }[] = [];
  private drawing = false;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number) {
    this.drawing = true;
    this.terrainPoints = [{ x: wx, y: wy }];
  }

  onMove(wx: number, wy: number) {
    if (!this.drawing) return;
    const last = this.terrainPoints[this.terrainPoints.length - 1];
    if (distance({ x: wx, y: wy }, last) > 0.1) {
      this.terrainPoints.push({ x: wx, y: wy });
    }
  }

  onUp() {
    if (!this.drawing) return;
    this.drawing = false;

    if (this.terrainPoints.length >= 2) {
      createTerrain(this.ctx.game.pw, this.terrainPoints);
    }
    this.terrainPoints = [];
  }

  reset() {
    this.drawing = false;
    this.terrainPoints = [];
  }
}
