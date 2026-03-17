import * as planck from "planck";
import { type ConveyorData, getBodyUserData, isConveyor } from "../engine/BodyUserData";
import { createWorldListener } from "../engine/Physics";

const ensureConveyorListener = createWorldListener((world) => {
  world.on("pre-solve", (contact) => {
    const bA = contact.getFixtureA().getBody();
    const bB = contact.getFixtureB().getBody();
    const udA = getBodyUserData(bA);
    const udB = getBodyUserData(bB);
    if (isConveyor(udA)) {
      contact.setTangentSpeed(udA.speed);
    } else if (isConveyor(udB)) {
      contact.setTangentSpeed(udB.speed);
    }
  });
});

export function createConveyor(world: planck.World, x: number, y: number, w = 6, speed = 3, angle = 0): planck.Body {
  ensureConveyorListener(world);
  const body = world.createBody({ type: "kinematic", position: planck.Vec2(x, y), angle });
  const fixture = body.createFixture({ shape: planck.Box(w / 2, 0.2), friction: 1 });
  fixture.setUserData({ fill: "rgba(200,160,50,0.8)", stroke: "rgba(200,160,50,0.5)" });
  body.setUserData({ fill: "rgba(200,160,50,0.8)", label: "conveyor", speed } satisfies ConveyorData);
  return body;
}
