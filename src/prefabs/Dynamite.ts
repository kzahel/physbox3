import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import { type DynamiteData, getBodyUserData, isDynamite } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import { forEachBodyByLabel, markDestroyed } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

const DYNAMITE_EXPLOSION_RADIUS = 15;
const DYNAMITE_EXPLOSION_FORCE = 6;

export function createDynamite(pw: PhysWorld, x: number, y: number, fuseTime = 3): Body {
  const body = makeBody(pw, x, y);

  const shapeDef = makeShapeDef({ density: 2, friction: 0.5 });
  body.CreatePolygonShape(shapeDef, b2().b2MakeBox(0.25, 0.4));

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
