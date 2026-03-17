import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import type { PhysWorld } from "../engine/PhysWorld";

export function createBall(pw: PhysWorld, x: number, y: number, radius = 0.5): Body {
  const body = makeBody(pw, x, y);

  const shapeDef = makeShapeDef({ density: 1, friction: 0.3, restitution: 0.6 });
  body.CreateCircleShape(shapeDef, makeCircle(radius));

  pw.setUserData(body, { fill: "rgba(100,200,255,0.7)" });
  return body;
}
