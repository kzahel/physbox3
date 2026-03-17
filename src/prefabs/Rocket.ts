import * as planck from "planck";
import { isRocket, type RocketData } from "../engine/BodyUserData";
import type { IRenderer } from "../engine/IRenderer";
import { forEachBodyByLabel } from "../engine/Physics";

export function createRocket(world: planck.World, x: number, y: number, angle = 0): planck.Body {
  const body = world.createBody({ type: "dynamic", position: planck.Vec2(x, y), angle });
  body.createFixture({ shape: planck.Box(0.3, 0.8), density: 1.5, friction: 0.3 });
  body.createFixture({
    shape: planck.Polygon([planck.Vec2(-0.3, 0.8), planck.Vec2(0.3, 0.8), planck.Vec2(0, 1.4)]),
    density: 0.5,
  });
  body.createFixture({
    shape: planck.Polygon([planck.Vec2(-0.3, -0.8), planck.Vec2(-0.7, -1.0), planck.Vec2(-0.3, -0.3)]),
    density: 0.3,
  });
  body.createFixture({
    shape: planck.Polygon([planck.Vec2(0.3, -0.8), planck.Vec2(0.7, -1.0), planck.Vec2(0.3, -0.3)]),
    density: 0.3,
  });
  body.setUserData({ fill: "rgba(200,200,220,0.9)", label: "rocket", thrust: 40, fuel: 20 } satisfies RocketData);
  return body;
}

/** Apply thrust forces and deplete fuel. Must be called inside the fixed timestep loop. */
export function applyRocketThrust(world: planck.World, dt: number): void {
  forEachBodyByLabel(
    world,
    isRocket,
    (b, ud) => {
      if (ud.fuel <= 0) return;
      ud.fuel -= dt;

      const angle = b.getAngle();
      const fx = -Math.sin(angle) * ud.thrust * b.getMass();
      const fy = Math.cos(angle) * ud.thrust * b.getMass();
      b.applyForceToCenter(planck.Vec2(fx, fy), true);
    },
    true,
  );
}

/** Spawn exhaust particles for active rockets. Called once per render frame. */
export function spawnRocketParticles(world: planck.World, renderer: IRenderer): void {
  forEachBodyByLabel(
    world,
    isRocket,
    (b, ud) => {
      if (ud.fuel <= 0) return;
      const angle = b.getAngle();
      const pos = b.getPosition();
      const exhaustX = pos.x + Math.sin(angle) * 1.0;
      const exhaustY = pos.y - Math.cos(angle) * 1.0;
      renderer.particles.spawnFlame(exhaustX, exhaustY, angle);
    },
    true,
  );
}
