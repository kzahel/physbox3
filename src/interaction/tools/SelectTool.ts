import type { Body } from "box2d3";
import { executeButtonAction, getSelectionButtons, hitButton } from "../SelectionButtons";
import type { ToolContext, ToolHandler } from "../ToolHandler";

// Re-export for external consumers
export { getBodyLabel, hasMotor, isDirectional } from "../SelectionButtons";

export class SelectTool implements ToolHandler {
  /** Visible to Renderer for UI overlay */
  selectedBody: Body | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number, sx: number, sy: number) {
    if (this.selectedBody) {
      const pos = this.selectedBody.GetPosition();
      const sp = this.ctx.game.camera.toScreen(pos.x, pos.y, this.ctx.game.container);

      for (const btn of getSelectionButtons(this.ctx.game.pw, this.selectedBody)) {
        if (hitButton(sx, sy, sp.x, sp.y - btn.offsetY)) {
          executeButtonAction(btn.id, this.ctx.game.pw, this.selectedBody);
          return;
        }
      }
    }
    this.selectedBody = this.ctx.findBodyAt(wx, wy);
  }

  reset() {
    this.selectedBody = null;
  }
}
