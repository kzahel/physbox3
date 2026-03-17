import * as planck from "planck";
import { getBodyUserData } from "../engine/BodyUserData";

export function createDynamite(
  world: planck.World,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
  x: number,
  y: number,
  fuseTime = 3,
): planck.Body {
  const body = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  body.createFixture({ shape: planck.Box(0.25, 0.4), density: 2, friction: 0.5 });
  body.setUserData({
    fill: "rgba(255,50,30,0.9)",
    label: "dynamite",
    fuseStart: performance.now(),
    fuseDuration: fuseTime,
  });

  setTimeout(() => {
    const ud = getBodyUserData(body);
    if (ud?.destroyed) return;
    const pos = body.getPosition();
    explodeAt(pos.x, pos.y, 8, 30);
    world.destroyBody(body);
  }, fuseTime * 1000);

  return body;
}
