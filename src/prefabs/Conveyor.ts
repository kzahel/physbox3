import type { Body } from "box2d3";
import { makeBody, makeShapeDef } from "../engine/BodyFactory";
import type { ConveyorData } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

/**
 * In box2d3, conveyor belt behavior is built into the surface material's tangentSpeed property.
 * No pre-solve callback is needed — the physics engine handles it automatically.
 */
export function createConveyor(pw: PhysWorld, x: number, y: number, w = 6, speed = 3, angle = 0): Body {
  const body = makeBody(pw, x, y, { type: "kinematic", rotation: angle });

  const shapeDef = makeShapeDef({ friction: 1, tangentSpeed: speed, hitEvents: false });
  body.CreatePolygonShape(shapeDef, b2().b2MakeBox(w / 2, 0.2));

  pw.setUserData(body, { fill: "rgba(200,160,50,0.8)", label: "conveyor", speed } satisfies ConveyorData);
  return body;
}
