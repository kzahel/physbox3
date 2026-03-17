import type { Body } from "box2d3";
import { b2 } from "../../engine/Box2D";
import type { ToolContext, ToolHandler } from "../ToolHandler";

const BRUSH_RADIUS_PX = 15;
/** Particles spawned per brush tick */
const PARTICLES_PER_TICK = 3;
/** Radius of each sand grain in world units */
const GRAIN_RADIUS = 0.06;

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
    const B2 = b2();
    const game = this.ctx.game;
    const world = game.camera.toWorld(sx, sy, game.container);
    const r = BRUSH_RADIUS_PX / game.camera.zoom;

    // Enforce particle cap — remove oldest if over limit
    this.enforceLimit(game);

    for (let i = 0; i < PARTICLES_PER_TICK && !game.pw.isFull; i++) {
      // Random position within brush radius
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * r;
      const wx = world.x + Math.cos(angle) * dist;
      const wy = world.y + Math.sin(angle) * dist;

      const bodyDef = B2.b2DefaultBodyDef();
      bodyDef.type = B2.b2BodyType.b2_dynamicBody;
      bodyDef.position = new B2.b2Vec2(wx, wy);
      bodyDef.linearDamping = 0.5;
      bodyDef.motionLocks.angularZ = true;
      const body = game.pw.createBody(bodyDef);

      const circle = new B2.b2Circle();
      circle.radius = GRAIN_RADIUS;
      const shapeDef = B2.b2DefaultShapeDef();
      shapeDef.density = 2.5;
      shapeDef.material.friction = 0.6;
      shapeDef.material.restitution = 0.05;
      body.CreateCircleShape(shapeDef, circle);

      const color = SAND_COLORS[Math.floor(Math.random() * SAND_COLORS.length)];
      game.pw.setUserData(body, { fill: color, label: "sand" });

      // Tiny random velocity so grains spread naturally
      body.SetLinearVelocity(new B2.b2Vec2((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5));

      game.sandBodies.push(body);
    }
  }

  private enforceLimit(game: { sandBodies: Body[]; maxSand: number; pw: { destroyBody(b: Body): void } }) {
    while (game.sandBodies.length + PARTICLES_PER_TICK > game.maxSand) {
      const oldest = game.sandBodies.shift();
      if (oldest?.IsValid()) {
        game.pw.destroyBody(oldest);
      }
    }
  }
}
