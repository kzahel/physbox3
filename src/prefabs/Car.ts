import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import { randomBodyColor } from "../engine/ColorUtils";
import { createWheelJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createCar(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();
  const r = Math.random;

  const sz = 0.7 + r() * 0.7;
  const halfW = 2 * sz;
  const halfH = 0.5 * sz;

  const bodyColor = randomBodyColor();
  const wg = 30 + Math.floor(r() * 40);
  const wheelColor = `rgba(${wg},${wg},${Math.floor(wg * 0.8)},0.9)`;

  // Chassis
  const chassis = makeBody(pw, x, y);
  const chassisShape = makeShapeDef({ density: 0.8 + r() * 0.6, friction: 0.3 });
  chassis.CreatePolygonShape(chassisShape, B2.b2MakeBox(halfW, halfH));
  pw.setUserData(chassis, { fill: bodyColor, label: "car" });

  // Cabin variations
  const cabinShape = makeShapeDef({ hitEvents: true });
  const style = Math.floor(r() * 4);
  let cabinVerts: { x: number; y: number }[];

  if (style === 0) {
    cabinShape.density = 0.5;
    cabinVerts = [
      { x: -halfW * 0.6, y: halfH },
      { x: -halfW * 0.3, y: halfH + halfH * 1.2 },
      { x: halfW * 0.5, y: halfH + halfH * 1.2 },
      { x: halfW * 0.7, y: halfH },
    ];
  } else if (style === 1) {
    cabinShape.density = 0.4;
    cabinVerts = [
      { x: halfW * 0.3, y: halfH },
      { x: halfW * 0.3, y: halfH + halfH * 1.4 },
      { x: halfW * 0.9, y: halfH + halfH * 1.4 },
      { x: halfW * 0.9, y: halfH },
    ];
  } else if (style === 2) {
    cabinShape.density = 0.6;
    cabinVerts = [
      { x: -halfW * 0.8, y: halfH },
      { x: -halfW * 0.2, y: halfH + halfH * 0.8 },
      { x: halfW * 0.6, y: halfH + halfH * 0.8 },
      { x: halfW * 0.9, y: halfH },
    ];
  } else {
    cabinShape.density = 0.4;
    cabinVerts = [
      { x: -halfW * 0.7, y: halfH },
      { x: -halfW * 0.7, y: halfH + halfH * 1.6 },
      { x: halfW * 0.7, y: halfH + halfH * 1.6 },
      { x: halfW * 0.7, y: halfH },
    ];
  }

  const cabinHull = B2.b2ComputeHull(cabinVerts.map((v) => new B2.b2Vec2(v.x, v.y)));
  chassis.CreatePolygonShape(cabinShape, B2.b2MakePolygon(cabinHull, 0));

  // Wheel parameters
  const motorSpeed = -(6 + r() * 14);
  const torque = 25 + r() * 75;
  const rearWheelRadius = (0.3 + r() * 0.45) * sz;
  const frontWheelRadius = (0.3 + r() * 0.45) * sz;
  const wheelX = halfW * 0.6;
  const suspAxis = { x: 0, y: 1 };

  // Rear wheel
  const rearY = -(halfH + rearWheelRadius * 0.4);
  const rearWheel = makeBody(pw, x - wheelX, y + rearY);
  const rearShape = makeShapeDef({ density: 1, friction: 0.7 + r() * 0.3 });
  rearWheel.CreateCircleShape(rearShape, makeCircle(rearWheelRadius));
  pw.setUserData(rearWheel, { fill: wheelColor });

  createWheelJoint(pw, chassis, rearWheel, { x: x - wheelX, y: y + rearY }, suspAxis, {
    enableSpring: true,
    hertz: 1.5 + r() * 6,
    dampingRatio: 0.2 + r() * 0.8,
    enableMotor: true,
    motorSpeed,
    maxMotorTorque: torque,
  });

  // Front wheel
  const frontY = -(halfH + frontWheelRadius * 0.4);
  const frontWheel = makeBody(pw, x + wheelX, y + frontY);
  const frontShape = makeShapeDef({ density: 1, friction: 0.7 + r() * 0.3 });
  frontWheel.CreateCircleShape(frontShape, makeCircle(frontWheelRadius));
  pw.setUserData(frontWheel, { fill: wheelColor });

  createWheelJoint(pw, chassis, frontWheel, { x: x + wheelX, y: y + frontY }, suspAxis, {
    enableSpring: true,
    hertz: 1.5 + r() * 6,
    dampingRatio: 0.2 + r() * 0.8,
    enableMotor: true,
    motorSpeed,
    maxMotorTorque: torque,
  });

  return chassis;
}
