import type { Body } from "box2d3";
import { markDestroyed } from "../../engine/Physics";
import { BrushTool } from "./BrushTool";

export const ERASE_RADIUS_PX = 24;

export class EraseTool extends BrushTool {
  readonly radiusPx = ERASE_RADIUS_PX;

  protected brushAction(bodies: Body[], worldX: number, worldY: number) {
    const radius = this.radiusPx / this.ctx.game.camera.zoom;
    this.ctx.game.eraseParticlesAt(worldX, worldY, radius);

    for (const b of bodies) {
      markDestroyed(this.ctx.game.pw, b);
      this.ctx.game.pw.destroyBody(b);
    }
  }
}
