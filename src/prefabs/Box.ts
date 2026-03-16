import * as planck from "planck";

export function createBox(world: planck.World, x: number, y: number, w = 1, h = 1): planck.Body {
  const body = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  body.createFixture({ shape: planck.Box(w / 2, h / 2), density: 1, friction: 0.4, restitution: 0.2 });
  body.setUserData({ fill: "rgba(200,120,255,0.7)" });
  return body;
}
