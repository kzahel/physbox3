import type { Body } from "box2d3";
import { type BalloonData, isBalloon } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import { randomBodyColor } from "../engine/ColorUtils";
import { forEachBodyByLabel } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBalloon(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();
  const r = Math.random;
  const radius = 0.5 + r() * 0.3;
  const color = randomBodyColor(70, 1, 55, 1, 0.75);

  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.linearDamping = 0.5;
  bodyDef.angularDamping = 1;
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 0.05;
  shapeDef.material.friction = 0.1;
  shapeDef.material.restitution = 0.4;
  shapeDef.enableHitEvents = true;

  // Main balloon
  const mainCircle = new B2.b2Circle();
  mainCircle.center = new B2.b2Vec2(0, 0);
  mainCircle.radius = radius;
  body.CreateCircleShape(shapeDef, mainCircle);

  // Knot
  const knotShape = B2.b2DefaultShapeDef();
  knotShape.density = 0.2;
  const knotCircle = new B2.b2Circle();
  knotCircle.center = new B2.b2Vec2(0, -radius - 0.15);
  knotCircle.radius = 0.06;
  body.CreateCircleShape(knotShape, knotCircle);

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
