import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import { createRevoluteJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createSeesaw(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();

  // Fulcrum (static triangle)
  const fulcrumDef = B2.b2DefaultBodyDef();
  fulcrumDef.type = B2.b2BodyType.b2_staticBody;
  fulcrumDef.position = new B2.b2Vec2(x, y);
  const fulcrum = pw.createBody(fulcrumDef);

  const fulcrumShapeDef = B2.b2DefaultShapeDef();
  fulcrumShapeDef.material.friction = 0.5;
  const hull = B2.b2ComputeHull([new B2.b2Vec2(-0.6, 0), new B2.b2Vec2(0.6, 0), new B2.b2Vec2(0, 0.8)]);
  fulcrum.CreatePolygonShape(fulcrumShapeDef, B2.b2MakePolygon(hull, 0));
  pw.setUserData(fulcrum, { fill: "rgba(140,120,100,0.9)" });

  // Plank (dynamic)
  const plankDef = B2.b2DefaultBodyDef();
  plankDef.type = B2.b2BodyType.b2_dynamicBody;
  plankDef.position = new B2.b2Vec2(x, y + 1);
  const plank = pw.createBody(plankDef);

  const plankShapeDef = B2.b2DefaultShapeDef();
  plankShapeDef.density = 1;
  plankShapeDef.material.friction = 0.7;
  plankShapeDef.enableHitEvents = true;
  plank.CreatePolygonShape(plankShapeDef, B2.b2MakeBox(3, 0.15));
  pw.setUserData(plank, { fill: "rgba(180,140,80,0.9)" });

  // Revolute joint at top of fulcrum
  createRevoluteJoint(pw, fulcrum, plank, { x, y: y + 0.8 });

  return plank;
}
