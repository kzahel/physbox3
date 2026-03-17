import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import { createRevoluteJoint, createWheelJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createTrain(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();
  const r = Math.random;

  const wheelRadius = 0.35;
  const wheelDensity = 1.2;
  const wheelFriction = 0.9;
  const suspAxis = { x: 0, y: 1 };
  const wheelColor = "rgba(40,40,35,0.9)";
  const carSpacing = 0.3;

  function makeWheel(wx: number, wy: number): Body {
    const def = B2.b2DefaultBodyDef();
    def.type = B2.b2BodyType.b2_dynamicBody;
    def.position = new B2.b2Vec2(wx, wy);
    const wheel = pw.createBody(def);
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = wheelDensity;
    shapeDef.material.friction = wheelFriction;
    shapeDef.enableHitEvents = true;
    const circle = new B2.b2Circle();
    circle.center = new B2.b2Vec2(0, 0);
    circle.radius = wheelRadius;
    wheel.CreateCircleShape(shapeDef, circle);
    pw.setUserData(wheel, { fill: wheelColor });
    return wheel;
  }

  function makePolygonShape(body: Body, verts: { x: number; y: number }[], density: number) {
    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.density = density;
    shapeDef.enableHitEvents = true;
    const hull = B2.b2ComputeHull(verts.map((v) => new B2.b2Vec2(v.x, v.y)));
    body.CreatePolygonShape(shapeDef, B2.b2MakePolygon(hull, 0));
  }

  // ── Engine ──
  const engHW = 1.8;
  const engHH = 0.6;
  const engHue = 200 + Math.floor(r() * 40);
  const engColor = `hsla(${engHue},50%,35%,0.9)`;

  const engineDef = B2.b2DefaultBodyDef();
  engineDef.type = B2.b2BodyType.b2_dynamicBody;
  engineDef.position = new B2.b2Vec2(x, y);
  const engine = pw.createBody(engineDef);

  const engShape = B2.b2DefaultShapeDef();
  engShape.density = 1.5;
  engShape.material.friction = 0.3;
  engShape.enableHitEvents = true;
  engine.CreatePolygonShape(engShape, B2.b2MakeBox(engHW, engHH));

  // Cab
  makePolygonShape(
    engine,
    [
      { x: engHW * 0.1, y: engHH },
      { x: engHW * 0.1, y: engHH + engHH * 1.2 },
      { x: engHW * 0.8, y: engHH + engHH * 1.2 },
      { x: engHW * 0.8, y: engHH },
    ],
    0.8,
  );

  // Nose
  makePolygonShape(
    engine,
    [
      { x: -engHW, y: engHH },
      { x: -engHW - 0.5, y: engHH * 0.3 },
      { x: -engHW - 0.5, y: -engHH * 0.5 },
      { x: -engHW, y: -engHH },
    ],
    0.6,
  );

  pw.setUserData(engine, { fill: engColor, label: "train" });

  // Engine wheels (motorized)
  const motorSpeed = 4;
  const motorTorque = 200;
  const engWheelX = engHW * 0.55;
  const engWheelY = -(engHH + wheelRadius * 0.4);

  for (const side of [-1, 1]) {
    const wx = x + engWheelX * side;
    const wy = y + engWheelY;
    const wheel = makeWheel(wx, wy);
    createWheelJoint(pw, engine, wheel, { x: wx, y: wy }, suspAxis, {
      enableSpring: true,
      hertz: 3,
      dampingRatio: 0.6,
      enableMotor: true,
      motorSpeed,
      maxMotorTorque: motorTorque,
    });
  }

  // ── Cargo cars ──
  const carHW = 1.6;
  const carHH = 0.35;
  const wallH = 1.0;
  const wallThick = 0.12;

  let prevBody = engine;
  let cx = x + engHW;

  for (let c = 0; c < 3; c++) {
    cx += carSpacing + carHW;
    const carHue = 30 + Math.floor(r() * 30);
    const carColor = `hsla(${carHue},40%,45%,0.85)`;

    const carDef = B2.b2DefaultBodyDef();
    carDef.type = B2.b2BodyType.b2_dynamicBody;
    carDef.position = new B2.b2Vec2(cx, y);
    const car = pw.createBody(carDef);

    // Floor
    const floorShape = B2.b2DefaultShapeDef();
    floorShape.density = 0.6;
    floorShape.material.friction = 0.3;
    floorShape.enableHitEvents = true;
    car.CreatePolygonShape(floorShape, B2.b2MakeBox(carHW, carHH));

    // Left wall
    makePolygonShape(
      car,
      [
        { x: -carHW, y: carHH },
        { x: -carHW, y: carHH + wallH },
        { x: -carHW + wallThick, y: carHH + wallH },
        { x: -carHW + wallThick, y: carHH },
      ],
      0.3,
    );

    // Right wall
    makePolygonShape(
      car,
      [
        { x: carHW - wallThick, y: carHH },
        { x: carHW - wallThick, y: carHH + wallH },
        { x: carHW, y: carHH + wallH },
        { x: carHW, y: carHH },
      ],
      0.3,
    );

    pw.setUserData(car, { fill: carColor, label: "train" });

    // Car wheels (no motor)
    const carWheelX = carHW * 0.6;
    const carWheelY = -(carHH + wheelRadius * 0.4);

    for (const side of [-1, 1]) {
      const wx = cx + carWheelX * side;
      const wy = y + carWheelY;
      const wheel = makeWheel(wx, wy);
      createWheelJoint(pw, car, wheel, { x: wx, y: wy }, suspAxis, {
        enableSpring: true,
        hertz: 3,
        dampingRatio: 0.6,
      });
    }

    // Coupling revolute joint
    const couplingX = cx - carHW - carSpacing / 2;
    createRevoluteJoint(pw, prevBody, car, { x: couplingX, y });

    prevBody = car;
    cx += carHW;
  }

  return engine;
}
