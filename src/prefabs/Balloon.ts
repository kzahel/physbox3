import * as planck from "planck";
import { getBodyUserData } from "../engine/BodyUserData";

export function createBalloon(world: planck.World, x: number, y: number): planck.Body {
  const r = Math.random;
  const radius = 0.5 + r() * 0.3;
  const hue = Math.floor(r() * 360);
  const color = `hsla(${hue},70%,55%,0.75)`;

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
  body.setUserData({ fill: color, label: "balloon", lift });
  return body;
}

export function applyBalloonLift(world: planck.World): void {
  for (let b = world.getBodyList(); b; b = b.getNext()) {
    if (!b.isDynamic()) continue;
    const ud = getBodyUserData(b);
    if (ud?.label !== "balloon" || !ud.lift) continue;
    b.applyForceToCenter(planck.Vec2(0, ud.lift * b.getMass()), true);
  }
}
