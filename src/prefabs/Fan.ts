import * as planck from "planck";
import type { Renderer } from "../engine/Renderer";

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
  body.setUserData({ fill: "rgba(120,180,220,0.85)", label: "fan", force, range });
  return body;
}

export function applyFanForce(world: planck.World, renderer: Renderer): void {
  for (let fan = world.getBodyList(); fan; fan = fan.getNext()) {
    const ud = fan.getUserData() as { label?: string; force?: number; range?: number } | null;
    if (ud?.label !== "fan") continue;

    const pos = fan.getPosition();
    const angle = fan.getAngle();
    const force = ud.force ?? 15;
    const range = ud.range ?? 10;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

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
      const dist = Math.hypot(bp.x - pos.x, bp.y - pos.y);
      const falloff = 1 - dist / range;
      const f = force * falloff * b.getMass();
      b.applyForceToCenter(planck.Vec2(dirX * f, dirY * f), true);
    }

    renderer.spawnWind(pos.x, pos.y, angle, range);
  }
}
