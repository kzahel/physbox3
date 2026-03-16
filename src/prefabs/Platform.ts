import * as planck from "planck";

export function createPlatform(world: planck.World, x: number, y: number, w: number, angle = 0): planck.Body {
  const body = world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
  body.createFixture({ shape: planck.Box(w / 2, 0.15), friction: 0.5 });
  body.setUserData({ fill: "rgba(80,100,80,0.8)", label: "platform" });
  return body;
}
