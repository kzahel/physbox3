import * as planck from "planck";

export function createBall(world: planck.World, x: number, y: number, radius = 0.5): planck.Body {
  const body = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  body.createFixture({ shape: planck.Circle(radius), density: 1, friction: 0.3, restitution: 0.6 });
  body.setUserData({ fill: "rgba(100,200,255,0.7)" });
  return body;
}
