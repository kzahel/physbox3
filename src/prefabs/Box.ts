import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBox(pw: PhysWorld, x: number, y: number, w = 1, h = 1): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.material.friction = 0.4;
  shapeDef.material.restitution = 0.2;
  shapeDef.enableHitEvents = true;

  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(w / 2, h / 2));

  pw.setUserData(body, { fill: "rgba(200,120,255,0.7)" });
  return body;
}
