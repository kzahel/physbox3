import * as planck from "planck";
import type { ToolContext, ToolHandler } from "../ToolHandler";

const BRUSH_RADIUS_PX = 15;
/** Particles spawned per brush tick */
const PARTICLES_PER_TICK = 3;
/** Radius of each sand grain in world units */
const GRAIN_RADIUS = 0.06;
/** Max sand particles in the world */
const MAX_SAND = 1000;

const SAND_COLORS = ["rgba(210,180,100,0.9)", "rgba(194,164,90,0.9)", "rgba(220,190,110,0.9)", "rgba(180,155,85,0.9)"];

export class SandTool implements ToolHandler {
  immediateTouch = true as const;
  touchDragMode = "brush" as const;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(_wx: number, _wy: number, sx: number, sy: number) {
    this.paint(sx, sy);
  }

  onBrush(_wx: number, _wy: number, sx: number, sy: number) {
    this.paint(sx, sy);
  }

  private paint(sx: number, sy: number) {
    const game = this.ctx.game;
    const world = game.camera.toWorld(sx, sy, game.container);
    const r = BRUSH_RADIUS_PX / game.camera.zoom;

    // Enforce particle cap — remove oldest if over limit
    this.enforceLimit(game);

    for (let i = 0; i < PARTICLES_PER_TICK; i++) {
      // Random position within brush radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * r;
      const wx = world.x + Math.cos(angle) * dist;
      const wy = world.y + Math.sin(angle) * dist;

      const body = game.world.createBody({
        type: "dynamic",
        position: planck.Vec2(wx, wy),
        bullet: false,
        fixedRotation: true,
        linearDamping: 0.5,
      });

      body.createFixture({
        shape: planck.Circle(GRAIN_RADIUS),
        density: 2.5,
        friction: 0.6,
        restitution: 0.05,
      });

      const color = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
      body.setUserData({ fill: color, label: "sand" });

      // Tiny random velocity so grains spread naturally
      body.setLinearVelocity(planck.Vec2((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));

      game.sandBodies.push(body);
    }
  }

  private enforceLimit(game: { sandBodies: planck.Body[]; world: planck.World }) {
    while (game.sandBodies.length + PARTICLES_PER_TICK > MAX_SAND) {
      const oldest = game.sandBodies.shift();
      if (oldest?.isActive()) {
        game.world.destroyBody(oldest);
      }
    }
  }
}
