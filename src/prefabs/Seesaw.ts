import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import { createRevoluteJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createSeesaw(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();

  // Fulcrum (static triangle)
  const fulcrum = makeBody(pw, x, y, { type: "static" });
  const fulcrumShapeDef = makeShapeDef({ friction: 0.5, hitEvents: false });
  const hull = B2.b2ComputeHull([new B2.b2Vec2(-0.6, 0), new B2.b2Vec2(0.6, 0), new B2.b2Vec2(0, 0.8)]);
  fulcrum.CreatePolygonShape(fulcrumShapeDef, B2.b2MakePolygon(hull, 0));
  pw.setUserData(fulcrum, { fill: "rgba(140,120,100,0.9)" });

  // Plank (dynamic)
  const plank = makeBody(pw, x, y + 1);
  const plankShapeDef = makeShapeDef({ density: 1, friction: 0.7 });
  plank.CreatePolygonShape(plankShapeDef, B2.b2MakeBox(3, 0.15));
  pw.setUserData(plank, { fill: "rgba(180,140,80,0.9)" });

  // Revolute joint at top of fulcrum
  createRevoluteJoint(pw, fulcrum, plank, { x, y: y + 0.8 });

  return plank;
}
