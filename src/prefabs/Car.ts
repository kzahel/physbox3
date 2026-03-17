import type { Body } from "box2d3";
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
  const chassisDef = B2.b2DefaultBodyDef();
  chassisDef.type = B2.b2BodyType.b2_dynamicBody;
  chassisDef.position = new B2.b2Vec2(x, y);
  const chassis = pw.createBody(chassisDef);

  const chassisShape = B2.b2DefaultShapeDef();
  chassisShape.density = 0.8 + r() * 0.6;
  chassisShape.material.friction = 0.3;
  chassisShape.enableHitEvents = true;
  chassis.CreatePolygonShape(chassisShape, B2.b2MakeBox(halfW, halfH));
  pw.setUserData(chassis, { fill: bodyColor, label: "car" });

  // Cabin variations
  const cabinShape = B2.b2DefaultShapeDef();
  cabinShape.enableHitEvents = true;
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
  const rearDef = B2.b2DefaultBodyDef();
  rearDef.type = B2.b2BodyType.b2_dynamicBody;
  rearDef.position = new B2.b2Vec2(x - wheelX, y + rearY);
  const rearWheel = pw.createBody(rearDef);
  const rearShape = B2.b2DefaultShapeDef();
  rearShape.density = 1;
  rearShape.material.friction = 0.7 + r() * 0.3;
  rearShape.enableHitEvents = true;
  const rearCircle = new B2.b2Circle();
  rearCircle.center = new B2.b2Vec2(0, 0);
  rearCircle.radius = rearWheelRadius;
  rearWheel.CreateCircleShape(rearShape, rearCircle);
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
  const frontDef = B2.b2DefaultBodyDef();
  frontDef.type = B2.b2BodyType.b2_dynamicBody;
  frontDef.position = new B2.b2Vec2(x + wheelX, y + frontY);
  const frontWheel = pw.createBody(frontDef);
  const frontShape = B2.b2DefaultShapeDef();
  frontShape.density = 1;
  frontShape.material.friction = 0.7 + r() * 0.3;
  frontShape.enableHitEvents = true;
  const frontCircle = new B2.b2Circle();
  frontCircle.center = new B2.b2Vec2(0, 0);
  frontCircle.radius = frontWheelRadius;
  frontWheel.CreateCircleShape(frontShape, frontCircle);
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
