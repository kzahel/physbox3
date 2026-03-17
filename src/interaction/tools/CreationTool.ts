import type { Game } from "../../engine/Game";
import type { Tool, ToolContext, ToolHandler } from "../ToolHandler";

type PlaceFn = (game: Game, x: number, y: number) => void;

const CREATORS: Partial<Record<Tool, PlaceFn>> = {
  box: (g, x, y) => g.addBox(x, y),
  ball: (g, x, y) => g.addBall(x, y),
  car: (g, x, y) => g.addCar(x, y),
  springball: (g, x, y) => g.addSpringBall(x, y),
  launcher: (g, x, y) => g.addLauncher(x, y),
  seesaw: (g, x, y) => g.addSeesaw(x, y),
  balloon: (g, x, y) => g.addBalloon(x, y),
  ragdoll: (g, x, y) => g.addRagdoll(x, y),
  dynamite: (g, x, y) => g.addDynamite(x, y),
  train: (g, x, y) => g.addTrain(x, y),
};

/** Simple one-click placement tools (box, ball, rope, car, etc.) */
export class CreationTool implements ToolHandler {
  isCreationTool = true;
  private ctx: ToolContext;
  private variant: Tool;

  constructor(ctx: ToolContext, variant: Tool) {
    this.ctx = ctx;
    this.variant = variant;
  }

  onDown(wx: number, wy: number) {
    this.place(wx, wy);
  }

  place(wx: number, wy: number) {
    if (this.ctx.game.pw.isFull) return;
    CREATORS[this.variant]?.(this.ctx.game, wx, wy);
  }
}
