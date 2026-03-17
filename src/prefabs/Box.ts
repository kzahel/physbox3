import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBox(pw: PhysWorld, x: number, y: number, w = 1, h = 1): Body {
  const body = makeBody(pw, x, y);

  const shapeDef = makeShapeDef({ density: 1, friction: 0.4, restitution: 0.2 });
  body.CreatePolygonShape(shapeDef, b2().b2MakeBox(w / 2, h / 2));

  pw.setUserData(body, { fill: "rgba(200,120,255,0.7)" });
  return body;
}
