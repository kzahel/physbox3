import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

export function createPlatform(pw: PhysWorld, x: number, y: number, w: number, angle = 0): Body {
  const body = makeBody(pw, x, y, { type: "static", rotation: angle });

  const shapeDef = makeShapeDef({ friction: 0.5, hitEvents: false });
  body.CreatePolygonShape(shapeDef, b2().b2MakeBox(w / 2, 0.15));

  pw.setUserData(body, { fill: "rgba(80,100,80,0.8)", label: "platform" });
  return body;
}
