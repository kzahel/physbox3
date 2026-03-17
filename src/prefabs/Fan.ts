import * as planck from "planck";
import { type FanData, isFan } from "../engine/BodyUserData";
import type { IRenderer } from "../engine/IRenderer";
import { distance, forEachBodyByLabel } from "../engine/Physics";

export function createFan(
  world: planck.World,
  x: number,
  y: number,
  angle: number,
  force = 15,
  range = 10,
): planck.Body {
  const body = world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
  body.createFixture({ shape: planck.Box(0.4, 0.25), friction: 0.5 });
  body.setUserData({ fill: "rgba(120,180,220,0.85)", label: "fan", force, range } satisfies FanData);
  return body;
}

/** Helper to iterate fans and compute direction/range. */
function forEachFan(
  world: planck.World,
  cb: (
    fan: planck.Body,
    pos: planck.Vec2,
    angle: number,
    force: number,
    range: number,
    dirX: number,
    dirY: number,
  ) => void,
) {
  forEachBodyByLabel(world, isFan, (fan, ud) => {
    const pos = fan.getPosition();
    const angle = fan.getAngle();
    cb(fan, pos, angle, ud.force, ud.range, Math.cos(angle), Math.sin(angle));
  });
}

/** Apply fan forces to nearby bodies. Must be called inside the fixed timestep loop. */
export function applyFanForce(world: planck.World): void {
  forEachFan(world, (fan, pos, _angle, force, range, dirX, dirY) => {
    const endX = pos.x + dirX * range;
    const endY = pos.y + dirY * range;
    const minX = Math.min(pos.x, endX) - 2;
    const minY = Math.min(pos.y, endY) - 2;
    const maxX = Math.max(pos.x, endX) + 2;
    const maxY = Math.max(pos.y, endY) + 2;

    const affected = new Set<planck.Body>();
    world.queryAABB(planck.AABB(planck.Vec2(minX, minY), planck.Vec2(maxX, maxY)), (fixture) => {
      const b = fixture.getBody();
      if (!b.isDynamic() || b === fan) return true;

      const bp = b.getPosition();
      const dx = bp.x - pos.x;
      const dy = bp.y - pos.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 0.1 || dist > range) return true;

      const dot = (dx * dirX + dy * dirY) / dist;
      if (dot < 0.3) return true;

      affected.add(b);
      return true;
    });

    for (const b of affected) {
      const bp = b.getPosition();
      const dist = distance(bp, pos);
      const falloff = 1 - dist / range;
      const f = force * falloff * b.getMass();
      b.applyForceToCenter(planck.Vec2(dirX * f, dirY * f), true);
    }
  });
}

/** Spawn wind particles for active fans. Called once per render frame. */
export function spawnFanParticles(world: planck.World, renderer: IRenderer): void {
  forEachFan(world, (_fan, pos, angle, _force, range) => {
    renderer.particles.spawnWind(pos.x, pos.y, angle, range);
  });
}
