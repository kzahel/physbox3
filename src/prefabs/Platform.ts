import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

export function createPlatform(pw: PhysWorld, x: number, y: number, w: number, angle = 0): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.rotation = B2.b2MakeRot(angle);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.material.friction = 0.5;

  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(w / 2, 0.15));

  pw.setUserData(body, { fill: "rgba(80,100,80,0.8)", label: "platform" });
  return body;
}
