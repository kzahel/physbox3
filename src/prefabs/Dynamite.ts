import * as planck from "planck";
import { type DynamiteData, getBodyUserData, isDynamite } from "../engine/BodyUserData";
import { forEachBodyByLabel, markDestroyed } from "../engine/Physics";

const DYNAMITE_EXPLOSION_RADIUS = 8;
const DYNAMITE_EXPLOSION_FORCE = 30;

export function createDynamite(world: planck.World, x: number, y: number, fuseTime = 3): planck.Body {
  const body = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  body.createFixture({ shape: planck.Box(0.25, 0.4), density: 2, friction: 0.5 });
  body.setUserData({
    fill: "rgba(255,50,30,0.9)",
    label: "dynamite",
    fuseRemaining: fuseTime,
    fuseDuration: fuseTime,
  } satisfies DynamiteData);
  return body;
}

/** Advance dynamite fuses by dt and explode when they reach zero. Called from Game.stepPhysics. */
export function tickDynamite(
  world: planck.World,
  dt: number,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
) {
  const toExplode: planck.Body[] = [];
  forEachBodyByLabel(world, isDynamite, (b, ud) => {
    ud.fuseRemaining -= dt;
    if (ud.fuseRemaining <= 0) toExplode.push(b);
  });
  for (const b of toExplode) {
    const ud = getBodyUserData(b);
    if (ud?.destroyed) continue;
    const pos = b.getPosition();
    explodeAt(pos.x, pos.y, DYNAMITE_EXPLOSION_RADIUS, DYNAMITE_EXPLOSION_FORCE);
    markDestroyed(b);
    world.destroyBody(b);
  }
}
