import type { Body } from "box2d3";
import { type FanData, isFan } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { IRenderer } from "../engine/IRenderer";
import { bodyAngle, distance, forEachBodyByLabel, isDynamic } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createFan(pw: PhysWorld, x: number, y: number, angle: number, force = 15, range = 10): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.rotation = B2.b2MakeRot(angle);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.material.friction = 0.5;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(0.4, 0.25));

  pw.setUserData(body, { fill: "rgba(120,180,220,0.85)", label: "fan", force, range } satisfies FanData);
  return body;
}

/** Helper to iterate fans and compute direction/range. */
function forEachFan(
  pw: PhysWorld,
  cb: (
    fan: Body,
    pos: { x: number; y: number },
    angle: number,
    force: number,
    range: number,
    dirX: number,
    dirY: number,
  ) => void,
) {
  forEachBodyByLabel(pw, isFan, (fan, ud) => {
    const pos = fan.GetPosition();
    const a = bodyAngle(fan);
    cb(fan, pos, a, ud.force, ud.range, Math.cos(a), Math.sin(a));
  });
}

/** Apply fan forces to nearby bodies. Must be called inside the fixed timestep loop. */
export function applyFanForce(pw: PhysWorld): void {
  const B2 = b2();
  forEachFan(pw, (fan, pos, _angle, force, range, dirX, dirY) => {
    const endX = pos.x + dirX * range;
    const endY = pos.y + dirY * range;
    const minX = Math.min(pos.x, endX) - 2;
    const minY = Math.min(pos.y, endY) - 2;
    const maxX = Math.max(pos.x, endX) + 2;
    const maxY = Math.max(pos.y, endY) + 2;

    // Collect affected bodies within AABB
    const affected: Body[] = [];
    pw.forEachBody((b) => {
      if (!isDynamic(b) || b === fan) return;
      const bp = b.GetPosition();
      if (bp.x < minX || bp.x > maxX || bp.y < minY || bp.y > maxY) return;

      const ddx = bp.x - pos.x;
      const ddy = bp.y - pos.y;
      const dist = Math.hypot(ddx, ddy);
      if (dist < 0.1 || dist > range) return;

      const dot = (ddx * dirX + ddy * dirY) / dist;
      if (dot < 0.3) return;

      affected.push(b);
    });

    for (const b of affected) {
      const bp = b.GetPosition();
      const dist = distance(bp, pos);
      const falloff = 1 - dist / range;
      const f = force * falloff * b.GetMass();
      b.ApplyForceToCenter(new B2.b2Vec2(dirX * f, dirY * f), true);
    }
  });
}

/** Spawn wind particles for active fans. Called once per render frame. */
export function spawnFanParticles(pw: PhysWorld, renderer: IRenderer): void {
  forEachFan(pw, (_fan, pos, angle, _force, range) => {
    renderer.particles.spawnWind(pos.x, pos.y, angle, range);
  });
}
