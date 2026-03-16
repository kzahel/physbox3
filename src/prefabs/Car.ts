import * as planck from "planck";

export function createCar(world: planck.World, x: number, y: number): planck.Body {
  const r = Math.random;

  const sz = 0.7 + r() * 0.7;
  const halfW = 2 * sz;
  const halfH = 0.5 * sz;

  const hue = Math.floor(r() * 360);
  const sat = 50 + Math.floor(r() * 40);
  const lit = 40 + Math.floor(r() * 25);
  const bodyColor = `hsla(${hue},${sat}%,${lit}%,0.85)`;

  const wg = 30 + Math.floor(r() * 40);
  const wheelColor = `rgba(${wg},${wg},${Math.floor(wg * 0.8)},0.9)`;

  const chassis = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  chassis.createFixture({ shape: planck.Box(halfW, halfH), density: 0.8 + r() * 0.6, friction: 0.3 });
  chassis.setUserData({ fill: bodyColor, label: "car" });

  const style = Math.floor(r() * 4);
  if (style === 0) {
    chassis.createFixture({
      shape: planck.Polygon([
        planck.Vec2(-halfW * 0.6, halfH),
        planck.Vec2(-halfW * 0.3, halfH + halfH * 1.2),
        planck.Vec2(halfW * 0.5, halfH + halfH * 1.2),
        planck.Vec2(halfW * 0.7, halfH),
      ]),
      density: 0.5,
    });
  } else if (style === 1) {
    chassis.createFixture({
      shape: planck.Polygon([
        planck.Vec2(halfW * 0.3, halfH),
        planck.Vec2(halfW * 0.3, halfH + halfH * 1.4),
        planck.Vec2(halfW * 0.9, halfH + halfH * 1.4),
        planck.Vec2(halfW * 0.9, halfH),
      ]),
      density: 0.4,
    });
  } else if (style === 2) {
    chassis.createFixture({
      shape: planck.Polygon([
        planck.Vec2(-halfW * 0.8, halfH),
        planck.Vec2(-halfW * 0.2, halfH + halfH * 0.8),
        planck.Vec2(halfW * 0.6, halfH + halfH * 0.8),
        planck.Vec2(halfW * 0.9, halfH),
      ]),
      density: 0.6,
    });
  } else {
    chassis.createFixture({
      shape: planck.Polygon([
        planck.Vec2(-halfW * 0.7, halfH),
        planck.Vec2(-halfW * 0.7, halfH + halfH * 1.6),
        planck.Vec2(halfW * 0.7, halfH + halfH * 1.6),
        planck.Vec2(halfW * 0.7, halfH),
      ]),
      density: 0.4,
    });
  }

  const motorSpeed = -(6 + r() * 14);
  const torque = 25 + r() * 75;

  const rearWheelRadius = (0.3 + r() * 0.45) * sz;
  const frontWheelRadius = (0.3 + r() * 0.45) * sz;
  const suspAxis = planck.Vec2(0, 1);

  const rearWheelOpts = {
    enableMotor: true,
    motorSpeed,
    maxMotorTorque: torque,
    frequencyHz: 1.5 + r() * 6,
    dampingRatio: 0.2 + r() * 0.8,
  };
  const frontWheelOpts = {
    enableMotor: true,
    motorSpeed,
    maxMotorTorque: torque,
    frequencyHz: 1.5 + r() * 6,
    dampingRatio: 0.2 + r() * 0.8,
  };

  const wheelX = halfW * 0.6;

  const rearY = -(halfH + rearWheelRadius * 0.4);
  const rearWheel = world.createBody({ type: "dynamic", position: planck.Vec2(x - wheelX, y + rearY) });
  rearWheel.createFixture({ shape: planck.Circle(rearWheelRadius), density: 1, friction: 0.7 + r() * 0.3 });
  rearWheel.setUserData({ fill: wheelColor });
  world.createJoint(planck.WheelJoint(rearWheelOpts, chassis, rearWheel, rearWheel.getPosition(), suspAxis));

  const frontY = -(halfH + frontWheelRadius * 0.4);
  const frontWheel = world.createBody({ type: "dynamic", position: planck.Vec2(x + wheelX, y + frontY) });
  frontWheel.createFixture({ shape: planck.Circle(frontWheelRadius), density: 1, friction: 0.7 + r() * 0.3 });
  frontWheel.setUserData({ fill: wheelColor });
  world.createJoint(planck.WheelJoint(frontWheelOpts, chassis, frontWheel, frontWheel.getPosition(), suspAxis));

  return chassis;
}
