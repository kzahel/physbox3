import type { Body } from "box2d3";
import { createRopeBetween } from "../prefabs/Rope";
import type { BodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { Game } from "./Game";
import { createDistanceJoint, createRevoluteJoint, createWeldJoint, createWheelJoint, markDestroyed } from "./Physics";
import type { PhysWorld } from "./PhysWorld";
import type { SceneData, SerializedJoint } from "./SceneStore";

// ── Body type helpers ──

function bodyTypeEnum(name: string) {
  const B2 = b2();
  if (name === "dynamic") return B2.b2BodyType.b2_dynamicBody;
  if (name === "kinematic") return B2.b2BodyType.b2_kinematicBody;
  return B2.b2BodyType.b2_staticBody;
}

// ── Joint deserialization ──

function deserializeJoint(pw: PhysWorld, sj: SerializedJoint, bodyA: Body, bodyB: Body): void {
  const anchorA = { x: sj.anchorX, y: sj.anchorY };
  const anchorB = { x: sj.anchorBX ?? sj.anchorX, y: sj.anchorBY ?? sj.anchorY };

  switch (sj.type) {
    case "weld":
      createWeldJoint(pw, bodyA, bodyB, anchorA);
      break;
    case "revolute":
      createRevoluteJoint(pw, bodyA, bodyB, anchorA, {
        collideConnected: sj.collideConnected,
        enableLimit: sj.enableMotorLimit,
        lowerAngle: sj.lowerAngle,
        upperAngle: sj.upperAngle,
        enableMotor: sj.enableMotor,
        motorSpeed: sj.motorSpeed,
        maxMotorTorque: sj.maxMotorTorque,
      });
      break;
    case "distance":
      createDistanceJoint(pw, bodyA, bodyB, anchorA, anchorB, {
        length: sj.length,
        collideConnected: sj.collideConnected,
        enableSpring: sj.enableSpring,
        hertz: sj.hertz,
        dampingRatio: sj.dampingRatio,
      });
      break;
    case "wheel":
      createWheelJoint(
        pw,
        bodyA,
        bodyB,
        anchorB,
        { x: sj.axisX ?? 0, y: sj.axisY ?? 1 },
        {
          enableMotor: sj.enableMotor,
          motorSpeed: sj.motorSpeed,
          maxMotorTorque: sj.maxMotorTorque,
          hertz: sj.hertz,
          dampingRatio: sj.dampingRatio,
        },
      );
      break;
    case "prismatic":
      // Prismatic joint creation helper doesn't exist yet — use flat API
      {
        const B2 = b2();
        const def = B2.b2DefaultPrismaticJointDef();
        const anchor = new B2.b2Vec2(anchorA.x, anchorA.y);

        def.base.bodyIdA = pw.getBodyId(bodyA);
        def.base.bodyIdB = pw.getBodyId(bodyB);

        const localAxis = bodyA.GetLocalVector(new B2.b2Vec2(sj.axisX ?? 1, sj.axisY ?? 0));
        const axisAngle = Math.atan2(localAxis.y, localAxis.x);

        const frameA = new B2.b2Transform();
        frameA.p = bodyA.GetLocalPoint(anchor);
        frameA.q = B2.b2MakeRot(axisAngle);
        def.base.localFrameA = frameA;

        const frameB = new B2.b2Transform();
        frameB.p = bodyB.GetLocalPoint(anchor);
        frameB.q = B2.b2Rot_identity;
        def.base.localFrameB = frameB;

        if (sj.collideConnected) def.base.collideConnected = true;
        if (sj.enableMotorLimit) {
          def.enableLimit = true;
          if (sj.lowerTranslation != null) def.lowerTranslation = sj.lowerTranslation;
          if (sj.upperTranslation != null) def.upperTranslation = sj.upperTranslation;
        }
        if (sj.enableMotor) {
          def.enableMotor = true;
          if (sj.motorSpeed != null) def.motorSpeed = sj.motorSpeed;
          if (sj.maxMotorForce != null) def.maxMotorForce = sj.maxMotorForce;
        }

        const jointId = B2.b2CreatePrismaticJoint(pw.worldId, def);
        pw.addJointId(jointId);
      }
      break;
  }
}

// ── Main deserialization ──

export function deserializeScene(game: Game, data: SceneData) {
  const pw = game.pw;
  const B2 = b2();

  // Clear everything
  const bodiesToRemove: Body[] = [];
  pw.forEachBody((b) => bodiesToRemove.push(b));
  for (const b of bodiesToRemove) {
    markDestroyed(pw, b);
    pw.destroyBody(b);
  }

  game.setGravity(data.gravity);

  const idToBody = new Map<number, Body>();

  for (const sb of data.bodies) {
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = bodyTypeEnum(sb.type);
    bodyDef.position = new B2.b2Vec2(sb.x, sb.y);
    bodyDef.rotation = B2.b2MakeRot(sb.angle);
    const body = pw.createBody(bodyDef);

    for (const ss of sb.shapes) {
      const shapeDef = B2.b2DefaultShapeDef();
      shapeDef.density = ss.density;
      shapeDef.material.friction = ss.friction;
      shapeDef.material.restitution = ss.restitution;
      shapeDef.enableHitEvents = true;

      switch (ss.type) {
        case "circle": {
          const circle = new B2.b2Circle();
          circle.center = new B2.b2Vec2(0, 0);
          circle.radius = ss.params[0];
          body.CreateCircleShape(shapeDef, circle);
          break;
        }
        case "box": {
          const poly = B2.b2MakeBox(ss.params[0], ss.params[1]);
          body.CreatePolygonShape(shapeDef, poly);
          break;
        }
        case "polygon": {
          const verts = [];
          for (let i = 0; i < ss.params.length; i += 2) {
            verts.push(new B2.b2Vec2(ss.params[i], ss.params[i + 1]));
          }
          const hull = B2.b2ComputeHull(verts);
          const poly = B2.b2MakePolygon(hull, 0);
          body.CreatePolygonShape(shapeDef, poly);
          break;
        }
        case "segment": {
          const seg = new B2.b2Segment();
          seg.point1 = new B2.b2Vec2(ss.params[0], ss.params[1]);
          seg.point2 = new B2.b2Vec2(ss.params[2], ss.params[3]);
          body.CreateSegmentShape(shapeDef, seg);
          break;
        }
      }
    }

    if (sb.userData) pw.setUserData(body, sb.userData as BodyUserData);
    idToBody.set(sb.id, body);
  }

  // Recreate joints
  for (const sj of data.joints) {
    const bodyA = idToBody.get(sj.bodyA);
    const bodyB = idToBody.get(sj.bodyB);
    if (!bodyA || !bodyB) continue;
    deserializeJoint(pw, sj, bodyA, bodyB);
  }

  // Recreate ropes
  if (data.ropes) {
    for (const r of data.ropes) {
      const bodyA = r.bodyAId !== null ? (idToBody.get(r.bodyAId) ?? null) : null;
      const bodyB = r.bodyBId !== null ? (idToBody.get(r.bodyBId) ?? null) : null;
      createRopeBetween(pw, r.x1, r.y1, r.x2, r.y2, bodyA, bodyB, r.links);
    }
  }

  // Re-create the InputManager ground body (old one was destroyed with all bodies)
  if (game.inputManager) {
    game.inputManager.resetGroundBody();
  }
}
