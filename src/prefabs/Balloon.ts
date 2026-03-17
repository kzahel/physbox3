import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { type BalloonData, isBalloon } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import { randomBodyColor } from "../engine/ColorUtils";
import { forEachBodyByLabel } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBalloon(pw: PhysWorld, x: number, y: number): Body {
  const r = Math.random;
  const radius = 0.5 + r() * 0.3;
  const color = randomBodyColor(70, 1, 55, 1, 0.75);

  const body = makeBody(pw, x, y, { linearDamping: 0.5, angularDamping: 1 });

  // Main balloon
  const shapeDef = makeShapeDef({ density: 0.05, friction: 0.1, restitution: 0.4 });
  body.CreateCircleShape(shapeDef, makeCircle(radius));

  // Knot
  const knotShape = makeShapeDef({ density: 0.2, hitEvents: false });
  body.CreateCircleShape(knotShape, makeCircle(0.06, 0, -radius - 0.15));

  const lift = 25 + r() * 10;
  pw.setUserData(body, { fill: color, label: "balloon", lift } satisfies BalloonData);
  return body;
}

export function applyBalloonLift(pw: PhysWorld): void {
  const B2 = b2();
  forEachBodyByLabel(
    pw,
    isBalloon,
    (b, ud) => {
      b.ApplyForceToCenter(new B2.b2Vec2(0, ud.lift * b.GetMass()), true);
    },
    true,
  );
}
