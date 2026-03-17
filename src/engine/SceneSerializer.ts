import type { Body, b2ShapeId } from "box2d3";
import { isTerrain } from "./BodyUserData";
import { b2 } from "./Box2D";
import type { Game } from "./Game";
import { bodyAngle } from "./Physics";
import type { JointHandle, PhysWorld } from "./PhysWorld";
import type {
  SceneData,
  SerializedBody,
  SerializedJoint,
  SerializedRope,
  SerializedShape,
  SerializedTerrain,
} from "./SceneStore";

// ── Joint type name mapping ──

function jointTypeName(joint: JointHandle): string {
  const B2 = b2();
  const t = joint.GetType().value;
  if (t === B2.b2JointType.b2_weldJoint.value) return "weld";
  if (t === B2.b2JointType.b2_revoluteJoint.value) return "revolute";
  if (t === B2.b2JointType.b2_distanceJoint.value) return "distance";
  if (t === B2.b2JointType.b2_wheelJoint.value) return "wheel";
  if (t === B2.b2JointType.b2_prismaticJoint.value) return "prismatic";
  if (t === B2.b2JointType.b2_motorJoint.value) return "motor";
  return "unknown";
}

// ── Body type helpers ──

function bodyTypeName(body: Body): "static" | "dynamic" | "kinematic" {
  const B2 = b2();
  const t = body.GetType().value;
  if (t === B2.b2BodyType.b2_dynamicBody.value) return "dynamic";
  if (t === B2.b2BodyType.b2_kinematicBody.value) return "kinematic";
  return "static";
}

// ── Joint property serialization ──

function serializeJointProps(joint: JointHandle, typeName: string, sj: SerializedJoint): void {
  const B2 = b2();
  const id = joint.id;
  switch (typeName) {
    case "revolute":
      sj.enableMotorLimit = B2.b2RevoluteJoint_IsLimitEnabled(id);
      sj.lowerAngle = B2.b2RevoluteJoint_GetLowerLimit(id);
      sj.upperAngle = B2.b2RevoluteJoint_GetUpperLimit(id);
      sj.enableMotor = B2.b2RevoluteJoint_IsMotorEnabled(id);
      sj.motorSpeed = B2.b2RevoluteJoint_GetMotorSpeed(id);
      sj.maxMotorTorque = B2.b2RevoluteJoint_GetMaxMotorTorque(id);
      break;
    case "distance":
      sj.hertz = B2.b2DistanceJoint_GetSpringHertz(id);
      sj.dampingRatio = B2.b2DistanceJoint_GetSpringDampingRatio(id);
      sj.length = B2.b2DistanceJoint_GetLength(id);
      sj.enableSpring = B2.b2DistanceJoint_IsSpringEnabled(id);
      break;
    case "wheel":
      sj.enableMotor = B2.b2WheelJoint_IsMotorEnabled(id);
      sj.motorSpeed = B2.b2WheelJoint_GetMotorSpeed(id);
      sj.maxMotorTorque = B2.b2WheelJoint_GetMaxMotorTorque(id);
      sj.hertz = B2.b2WheelJoint_GetSpringHertz(id);
      sj.dampingRatio = B2.b2WheelJoint_GetSpringDampingRatio(id);
      {
        const frameA = joint.GetLocalFrameA();
        const angle = B2.b2Rot_GetAngle(frameA.q);
        sj.axisX = Math.cos(angle);
        sj.axisY = Math.sin(angle);
      }
      break;
    case "prismatic":
      sj.enableMotorLimit = B2.b2PrismaticJoint_IsLimitEnabled(id);
      sj.lowerTranslation = B2.b2PrismaticJoint_GetLowerLimit(id);
      sj.upperTranslation = B2.b2PrismaticJoint_GetUpperLimit(id);
      sj.enableMotor = B2.b2PrismaticJoint_IsMotorEnabled(id);
      sj.motorSpeed = B2.b2PrismaticJoint_GetMotorSpeed(id);
      sj.maxMotorForce = B2.b2PrismaticJoint_GetMaxMotorForce(id);
      {
        const frameA = joint.GetLocalFrameA();
        const angle = B2.b2Rot_GetAngle(frameA.q);
        sj.axisX = Math.cos(angle);
        sj.axisY = Math.sin(angle);
      }
      break;
  }
}

// ── Helpers ──

function isRopeInternal(pw: PhysWorld, b: Body): boolean {
  const ud = pw.getUserData(b);
  return ud?.label === "ropeLink" || ud?.label === "ropeAnchor";
}

// ── Main serialization ──

export function serializeScene(game: Game): SceneData {
  const pw = game.pw;
  const B2 = b2();

  // ── Identify rope components to exclude from normal serialization ──
  const ropeBodies = new Set<Body>();
  const ropeJoints = new Set<JointHandle>();
  const ropes: SerializedRope[] = [];

  // Find all rope-internal bodies
  pw.forEachBody((b) => {
    if (isRopeInternal(pw, b)) ropeBodies.add(b);
  });

  // Find rope-related joints and extract rope metadata
  const ropeMetadata: {
    joint: JointHandle;
    bodyA: Body;
    bodyB: Body;
  }[] = [];

  pw.forEachJoint((j) => {
    const ud = pw.getJointData(j);
    if (ud?.ropeStabilizer) {
      ropeJoints.add(j);
      return;
    }
    const bA = j.GetBodyA();
    const bB = j.GetBodyB();
    if (ud?.isMainRope) {
      ropeJoints.add(j);
      if (bA && bB) {
        ropeMetadata.push({ joint: j, bodyA: bA, bodyB: bB });
      }
      return;
    }
    // RevoluteJoints between rope links
    if ((bA && ropeBodies.has(bA)) || (bB && ropeBodies.has(bB))) {
      ropeJoints.add(j);
    }
  });

  // Extract rope metadata
  for (const rm of ropeMetadata) {
    const { joint, bodyA, bodyB } = rm;
    const frameA = joint.GetLocalFrameA();
    const frameB = joint.GetLocalFrameB();
    const anchorA = bodyA.GetWorldPoint(frameA.p);
    const anchorB = bodyB.GetWorldPoint(frameB.p);

    const ud = pw.getJointData(joint);
    const chainBodies = (ud?.chainBodies as Body[] | undefined) ?? [];
    const links = chainBodies.length + 1;

    ropes.push({
      bodyAId: null, // resolved below after body IDs are assigned
      bodyBId: null,
      x1: anchorA.x,
      y1: anchorA.y,
      x2: anchorB.x,
      y2: anchorB.y,
      links,
      // Temp refs for ID resolution
      _bodyA: ropeBodies.has(bodyA) ? null : bodyA,
      _bodyB: ropeBodies.has(bodyB) ? null : bodyB,
    } as SerializedRope & { _bodyA?: Body | null; _bodyB?: Body | null });
  }

  // ── Serialize non-rope bodies ──
  const bodyMap = new Map<Body, number>();
  const bodies: SerializedBody[] = [];
  let nextId = 0;

  // ── Serialize terrain bodies ──
  const terrains: SerializedTerrain[] = [];
  const terrainBodies = new Set<Body>();

  pw.forEachBody((b) => {
    const ud = pw.getUserData(b);
    if (isTerrain(ud)) {
      terrainBodies.add(b);
      terrains.push({ points: ud.terrainPoints.map((p) => ({ x: p.x, y: p.y })) });
    }
  });

  // ── Serialize non-rope, non-terrain bodies ──
  pw.forEachBody((b) => {
    if (ropeBodies.has(b) || terrainBodies.has(b)) return;

    const id = nextId++;
    bodyMap.set(b, id);

    const shapes: SerializedShape[] = [];
    const shapeIds: b2ShapeId[] = b.GetShapes() ?? [];
    for (const shapeId of shapeIds) {
      const shapeType = B2.b2Shape_GetType(shapeId);
      const sd: SerializedShape = {
        type: "box",
        params: [],
        density: B2.b2Shape_GetDensity(shapeId),
        friction: B2.b2Shape_GetFriction(shapeId),
        restitution: B2.b2Shape_GetRestitution(shapeId),
      };

      if (shapeType.value === B2.b2ShapeType.b2_circleShape.value) {
        const circle = B2.b2Shape_GetCircle(shapeId);
        sd.type = "circle";
        sd.params = [circle.radius];
      } else if (shapeType.value === B2.b2ShapeType.b2_polygonShape.value) {
        const poly = B2.b2Shape_GetPolygon(shapeId);
        // Detect axis-aligned box (4 verts, symmetric about origin)
        if (poly.count === 4) {
          let maxX = 0;
          let maxY = 0;
          for (let i = 0; i < 4; i++) {
            const v = poly.GetVertex(i);
            maxX = Math.max(maxX, Math.abs(v.x));
            maxY = Math.max(maxY, Math.abs(v.y));
          }
          sd.type = "box";
          sd.params = [maxX, maxY];
        } else {
          sd.type = "polygon";
          const verts: number[] = [];
          for (let i = 0; i < poly.count; i++) {
            const v = poly.GetVertex(i);
            verts.push(v.x, v.y);
          }
          sd.params = verts;
        }
      } else if (shapeType.value === B2.b2ShapeType.b2_segmentShape.value) {
        const seg = B2.b2Shape_GetSegment(shapeId);
        sd.type = "segment";
        sd.params = [seg.point1.x, seg.point1.y, seg.point2.x, seg.point2.y];
      } else {
        continue;
      }

      shapes.push(sd);
    }

    const pos = b.GetPosition();
    bodies.push({
      id,
      type: bodyTypeName(b),
      x: pos.x,
      y: pos.y,
      angle: bodyAngle(b),
      shapes,
      userData: pw.getUserData(b),
    });
  });

  // Resolve rope body references to IDs
  for (const r of ropes) {
    const raw = r as SerializedRope & { _bodyA?: Body | null; _bodyB?: Body | null };
    r.bodyAId = raw._bodyA ? (bodyMap.get(raw._bodyA) ?? null) : null;
    r.bodyBId = raw._bodyB ? (bodyMap.get(raw._bodyB) ?? null) : null;
    delete raw._bodyA;
    delete raw._bodyB;
  }

  // ── Serialize non-rope joints ──
  const joints: SerializedJoint[] = [];
  pw.forEachJoint((j) => {
    if (ropeJoints.has(j)) return;

    const bA = j.GetBodyA();
    const bB = j.GetBodyB();
    const bodyAId = bodyMap.get(bA);
    const bodyBId = bodyMap.get(bB);
    if (bodyAId === undefined || bodyBId === undefined) return;

    // Get world-space anchors from local frames
    const frameA = j.GetLocalFrameA();
    const frameB = j.GetLocalFrameB();
    const worldAnchorA = bA.GetWorldPoint(frameA.p);
    const worldAnchorB = bB.GetWorldPoint(frameB.p);

    const typeName = jointTypeName(j);
    const sj: SerializedJoint = {
      type: typeName,
      bodyA: bodyAId,
      bodyB: bodyBId,
      anchorX: worldAnchorA.x,
      anchorY: worldAnchorA.y,
      anchorBX: worldAnchorB.x,
      anchorBY: worldAnchorB.y,
      collideConnected: j.GetCollideConnected(),
    };

    serializeJointProps(j, typeName, sj);
    joints.push(sj);
  });

  return {
    bodies,
    joints,
    ropes: ropes.length > 0 ? ropes : undefined,
    terrains: terrains.length > 0 ? terrains : undefined,
    gravity: game.gravity,
  };
}
