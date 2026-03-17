import type { Body } from "box2d3";
import type { ConveyorData } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

/**
 * In box2d3, conveyor belt behavior is built into the surface material's tangentSpeed property.
 * No pre-solve callback is needed — the physics engine handles it automatically.
 */
export function createConveyor(pw: PhysWorld, x: number, y: number, w = 6, speed = 3, angle = 0): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_kinematicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.rotation = B2.b2MakeRot(angle);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.material.friction = 1;
  shapeDef.material.tangentSpeed = speed;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(w / 2, 0.2));

  pw.setUserData(body, { fill: "rgba(200,160,50,0.8)", label: "conveyor", speed } satisfies ConveyorData);
  return body;
}
