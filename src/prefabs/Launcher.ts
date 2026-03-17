import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import { createWeldJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createLauncher(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();

  // Static base
  const baseDef = B2.b2DefaultBodyDef();
  baseDef.type = B2.b2BodyType.b2_staticBody;
  baseDef.position = new B2.b2Vec2(x, y);
  const base = pw.createBody(baseDef);
  const baseShape = B2.b2DefaultShapeDef();
  baseShape.material.friction = 0.5;
  base.CreatePolygonShape(baseShape, B2.b2MakeBox(1.5, 0.3));
  pw.setUserData(base, { fill: "rgba(100,100,120,0.9)" });

  // Dynamic rod
  const rodDef = B2.b2DefaultBodyDef();
  rodDef.type = B2.b2BodyType.b2_dynamicBody;
  rodDef.position = new B2.b2Vec2(x, y + 1.5);
  const rod = pw.createBody(rodDef);
  const rodShape = B2.b2DefaultShapeDef();
  rodShape.density = 0.5;
  rodShape.material.friction = 0.2;
  rodShape.enableHitEvents = true;
  rod.CreatePolygonShape(rodShape, B2.b2MakeBox(0.15, 1));
  pw.setUserData(rod, { fill: "rgba(160,160,180,0.8)" });

  // Dynamic platform
  const platDef = B2.b2DefaultBodyDef();
  platDef.type = B2.b2BodyType.b2_dynamicBody;
  platDef.position = new B2.b2Vec2(x, y + 2.8);
  const plat = pw.createBody(platDef);
  const platShape = B2.b2DefaultShapeDef();
  platShape.density = 1;
  platShape.material.friction = 0.7;
  platShape.enableHitEvents = true;
  plat.CreatePolygonShape(platShape, B2.b2MakeBox(2, 0.2));
  pw.setUserData(plat, { fill: "rgba(80,180,80,0.8)" });

  // Weld rod to platform
  createWeldJoint(pw, rod, plat, { x, y: y + 2.5 });

  // Prismatic joint: base → rod (vertical piston)
  const prisDef = B2.b2DefaultPrismaticJointDef();
  const anchorVec = new B2.b2Vec2(x, y);
  prisDef.base.bodyIdA = pw.getBodyId(base);
  prisDef.base.bodyIdB = pw.getBodyId(rod);

  // Axis direction (0,1) = vertical, encoded in localFrameA rotation
  const localAxis = base.GetLocalVector(new B2.b2Vec2(0, 1));
  const axisAngle = Math.atan2(localAxis.y, localAxis.x);

  const frameA = new B2.b2Transform();
  frameA.p = base.GetLocalPoint(anchorVec);
  frameA.q = B2.b2MakeRot(axisAngle);
  prisDef.base.localFrameA = frameA;

  const frameB = new B2.b2Transform();
  frameB.p = rod.GetLocalPoint(anchorVec);
  const localAxisB = rod.GetLocalVector(new B2.b2Vec2(0, 1));
  frameB.q = B2.b2MakeRot(Math.atan2(localAxisB.y, localAxisB.x));
  prisDef.base.localFrameB = frameB;

  prisDef.enableLimit = true;
  prisDef.lowerTranslation = 0;
  prisDef.upperTranslation = 3;
  prisDef.enableMotor = true;
  prisDef.maxMotorForce = 500;
  prisDef.motorSpeed = 5;

  const pistonId = B2.b2CreatePrismaticJoint(pw.worldId, prisDef);
  const piston = pw.addJointId(pistonId);

  // Oscillate the piston motor
  const oscillate = () => {
    if (!piston.IsValid()) return;
    const t = B2.b2PrismaticJoint_GetTranslation(piston.id);
    const upper = 3;
    if (t >= upper * 0.95) {
      B2.b2PrismaticJoint_SetMotorSpeed(piston.id, -8);
    } else if (t <= 0.05) {
      B2.b2PrismaticJoint_SetMotorSpeed(piston.id, 5);
    }
    requestAnimationFrame(oscillate);
  };
  requestAnimationFrame(oscillate);

  return plat;
}
