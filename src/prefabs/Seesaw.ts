import * as planck from "planck";

export function createSeesaw(world: planck.World, x: number, y: number): planck.Body {
  const fulcrum = world.createBody({ type: "static", position: planck.Vec2(x, y) });
  fulcrum.createFixture({
    shape: planck.Polygon([planck.Vec2(-0.6, 0), planck.Vec2(0.6, 0), planck.Vec2(0, 0.8)]),
    friction: 0.5,
  });
  fulcrum.setUserData({ fill: "rgba(140,120,100,0.9)" });

  const plank = world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 1) });
  plank.createFixture({ shape: planck.Box(3, 0.15), density: 1, friction: 0.7 });
  plank.setUserData({ fill: "rgba(180,140,80,0.9)" });

  world.createJoint(planck.RevoluteJoint({}, fulcrum, plank, planck.Vec2(x, y + 0.8)));

  return plank;
}
