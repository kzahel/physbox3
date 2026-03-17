import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBall(pw: PhysWorld, x: number, y: number, radius = 0.5): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.material.friction = 0.3;
  shapeDef.material.restitution = 0.6;
  shapeDef.enableHitEvents = true;

  const circle = new B2.b2Circle();
  circle.center = new B2.b2Vec2(0, 0);
  circle.radius = radius;
  body.CreateCircleShape(shapeDef, circle);

  pw.setUserData(body, { fill: "rgba(100,200,255,0.7)" });
  return body;
}
