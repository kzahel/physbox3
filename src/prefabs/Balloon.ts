import * as planck from "planck";
import { type BalloonData, isBalloon } from "../engine/BodyUserData";
import { randomBodyColor } from "../engine/ColorUtils";
import { forEachBodyByLabel } from "../engine/Physics";

export function createBalloon(world: planck.World, x: number, y: number): planck.Body {
  const r = Math.random;
  const radius = 0.5 + r() * 0.3;
  const color = randomBodyColor(70, 1, 55, 1, 0.75);

  const body = world.createBody({
    type: "dynamic",
    position: planck.Vec2(x, y),
    linearDamping: 0.5,
    angularDamping: 1,
  });
  body.createFixture({ shape: planck.Circle(radius), density: 0.05, friction: 0.1, restitution: 0.4 });

  body.createFixture({
    shape: planck.Circle(planck.Vec2(0, -radius - 0.15), 0.06),
    density: 0.2,
  });

  const lift = 25 + r() * 10;
  body.setUserData({ fill: color, label: "balloon", lift } satisfies BalloonData);
  return body;
}

export function applyBalloonLift(world: planck.World): void {
  forEachBodyByLabel(
    world,
    isBalloon,
    (b, ud) => {
      b.applyForceToCenter(planck.Vec2(0, ud.lift * b.getMass()), true);
    },
    true,
  );
}
