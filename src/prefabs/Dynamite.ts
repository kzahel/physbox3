import type { Body } from "box2d3";
import { type DynamiteData, getBodyUserData, isDynamite } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import { forEachBodyByLabel, markDestroyed } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

const DYNAMITE_EXPLOSION_RADIUS = 8;
const DYNAMITE_EXPLOSION_FORCE = 3;

export function createDynamite(pw: PhysWorld, x: number, y: number, fuseTime = 3): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 2;
  shapeDef.material.friction = 0.5;
  shapeDef.enableHitEvents = true;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(0.25, 0.4));

  pw.setUserData(body, {
    fill: "rgba(255,50,30,0.9)",
    label: "dynamite",
    fuseRemaining: fuseTime,
    fuseDuration: fuseTime,
  } satisfies DynamiteData);
  return body;
}

/** Advance dynamite fuses by dt and explode when they reach zero. Called from Game.stepPhysics. */
export function tickDynamite(
  pw: PhysWorld,
  dt: number,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
) {
  const toExplode: Body[] = [];
  forEachBodyByLabel(pw, isDynamite, (b, ud) => {
    ud.fuseRemaining -= dt;
    if (ud.fuseRemaining <= 0) toExplode.push(b);
  });
  for (const b of toExplode) {
    const ud = getBodyUserData(pw, b);
    if (ud?.destroyed) continue;
    const pos = b.GetPosition();
    explodeAt(pos.x, pos.y, DYNAMITE_EXPLOSION_RADIUS, DYNAMITE_EXPLOSION_FORCE);
    markDestroyed(pw, b);
    pw.destroyBody(b);
  }
}
