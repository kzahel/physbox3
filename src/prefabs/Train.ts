import * as planck from "planck";

export function createTrain(world: planck.World, x: number, y: number): planck.Body {
  const r = Math.random;

  const wheelRadius = 0.35;
  const wheelDensity = 1.2;
  const wheelFriction = 0.9;
  const suspAxis = planck.Vec2(0, 1);
  const wheelColor = "rgba(40,40,35,0.9)";

  const carSpacing = 0.3; // gap between cars

  // ── Engine (front) ──
  const engHW = 1.8;
  const engHH = 0.6;
  const engHue = 200 + Math.floor(r() * 40);
  const engColor = `hsla(${engHue},50%,35%,0.9)`;

  const engine = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  // Main body
  engine.createFixture({ shape: planck.Box(engHW, engHH), density: 1.5, friction: 0.3 });
  // Cab on top
  engine.createFixture({
    shape: planck.Polygon([
      planck.Vec2(engHW * 0.1, engHH),
      planck.Vec2(engHW * 0.1, engHH + engHH * 1.2),
      planck.Vec2(engHW * 0.8, engHH + engHH * 1.2),
      planck.Vec2(engHW * 0.8, engHH),
    ]),
    density: 0.8,
  });
  // Nose
  engine.createFixture({
    shape: planck.Polygon([
      planck.Vec2(-engHW, engHH),
      planck.Vec2(-engHW - 0.5, engHH * 0.3),
      planck.Vec2(-engHW - 0.5, -engHH * 0.5),
      planck.Vec2(-engHW, -engHH),
    ]),
    density: 0.6,
  });
  engine.setUserData({ fill: engColor, label: "train" });

  // Engine wheels - strong motor, slow speed
  const motorSpeed = 4;
  const motorTorque = 200;
  const engWheelOpts = {
    enableMotor: true,
    motorSpeed,
    maxMotorTorque: motorTorque,
    frequencyHz: 3,
    dampingRatio: 0.6,
  };

  const engWheelX = engHW * 0.55;
  const engWheelY = -(engHH + wheelRadius * 0.4);

  for (const side of [-1, 1]) {
    const wheel = world.createBody({
      type: "dynamic",
      position: planck.Vec2(x + engWheelX * side, y + engWheelY),
    });
    wheel.createFixture({
      shape: planck.Circle(wheelRadius),
      density: wheelDensity,
      friction: wheelFriction,
    });
    wheel.setUserData({ fill: wheelColor });
    world.createJoint(planck.WheelJoint(engWheelOpts, engine, wheel, wheel.getPosition(), suspAxis));
  }

  // ── Cargo cars ──
  const carHW = 1.6;
  const carHH = 0.35;
  const wallH = 1.0; // wall height above floor
  const wallThick = 0.12;

  let prevBody = engine;
  let cx = x + engHW; // right edge of engine

  for (let c = 0; c < 3; c++) {
    cx += carSpacing + carHW; // advance to center of next car
    const carHue = 30 + Math.floor(r() * 30);
    const carColor = `hsla(${carHue},40%,45%,0.85)`;

    const car = world.createBody({ type: "dynamic", position: planck.Vec2(cx, y) });
    // Floor
    car.createFixture({ shape: planck.Box(carHW, carHH), density: 0.6, friction: 0.3 });
    // Left wall
    car.createFixture({
      shape: planck.Polygon([
        planck.Vec2(-carHW, carHH),
        planck.Vec2(-carHW, carHH + wallH),
        planck.Vec2(-carHW + wallThick, carHH + wallH),
        planck.Vec2(-carHW + wallThick, carHH),
      ]),
      density: 0.3,
    });
    // Right wall
    car.createFixture({
      shape: planck.Polygon([
        planck.Vec2(carHW - wallThick, carHH),
        planck.Vec2(carHW - wallThick, carHH + wallH),
        planck.Vec2(carHW, carHH + wallH),
        planck.Vec2(carHW, carHH),
      ]),
      density: 0.3,
    });
    car.setUserData({ fill: carColor, label: "train" });

    // Car wheels (no motor)
    const carWheelOpts = {
      enableMotor: false,
      motorSpeed: 0,
      maxMotorTorque: 0,
      frequencyHz: 3,
      dampingRatio: 0.6,
    };
    const carWheelX = carHW * 0.6;
    const carWheelY = -(carHH + wheelRadius * 0.4);

    for (const side of [-1, 1]) {
      const wheel = world.createBody({
        type: "dynamic",
        position: planck.Vec2(cx + carWheelX * side, y + carWheelY),
      });
      wheel.createFixture({
        shape: planck.Circle(wheelRadius),
        density: wheelDensity,
        friction: wheelFriction,
      });
      wheel.setUserData({ fill: wheelColor });
      world.createJoint(planck.WheelJoint(carWheelOpts, car, wheel, wheel.getPosition(), suspAxis));
    }

    // Coupling: revolute joint between prev car's right side and this car's left side
    const couplingX = cx - carHW - carSpacing / 2;
    world.createJoint(planck.RevoluteJoint({}, prevBody, car, planck.Vec2(couplingX, y)));

    prevBody = car;
    cx += carHW; // move cx to right edge of this car
  }

  return engine;
}
