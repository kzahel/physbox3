import * as planck from "planck";
import { type ConveyorData, getBodyUserData, isConveyor } from "../engine/BodyUserData";

export function createConveyor(world: planck.World, x: number, y: number, w = 6, speed = 3, angle = 0): planck.Body {
  const body = world.createBody({ type: "kinematic", position: planck.Vec2(x, y), angle });
  const fixture = body.createFixture({ shape: planck.Box(w / 2, 0.2), friction: 1 });
  fixture.setUserData({ fill: "rgba(200,160,50,0.8)", stroke: "rgba(200,160,50,0.5)" });
  body.setUserData({ fill: "rgba(200,160,50,0.8)", label: "conveyor", speed } satisfies ConveyorData);

  world.on("pre-solve", (contact) => {
    const bA = contact.getFixtureA().getBody();
    const bB = contact.getFixtureB().getBody();
    if (bA === body || bB === body) {
      const ud = getBodyUserData(body);
      contact.setTangentSpeed(isConveyor(ud) ? ud.speed : speed);
    }
  });

  return body;
}
