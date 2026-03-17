import type { Body, b2ShapeId } from "box2d3";
import { createRopeBetween } from "../prefabs/Rope";
import { b2 } from "./Box2D";
import type { Game } from "./Game";
import {
  bodyAngle,
  createDistanceJoint,
  createRevoluteJoint,
  createWeldJoint,
  createWheelJoint,
  markDestroyed,
} from "./Physics";
import type { JointHandle, PhysWorld } from "./PhysWorld";

// ── Serialization types ──

interface SerializedShape {
  type: "circle" | "box" | "polygon" | "segment";
  params: number[];
  density: number;
  friction: number;
  restitution: number;
}

interface SerializedBody {
  id: number;
  type: "static" | "dynamic" | "kinematic";
  x: number;
  y: number;
  angle: number;
  shapes: SerializedShape[];
  userData: unknown;
}

interface SerializedJoint {
  type: string;
  bodyA: number;
  bodyB: number;
  anchorX: number;
  anchorY: number;
  anchorBX?: number;
  anchorBY?: number;
  // DistanceJoint
  hertz?: number;
  dampingRatio?: number;
  length?: number;
  collideConnected?: boolean;
  enableSpring?: boolean;
  enableLimit?: boolean;
  maxLength?: number;
  // RevoluteJoint
  enableMotorLimit?: boolean;
  lowerAngle?: number;
  upperAngle?: number;
  enableMotor?: boolean;
  motorSpeed?: number;
  maxMotorTorque?: number;
  // WheelJoint
  axisX?: number;
  axisY?: number;
  // PrismaticJoint
  lowerTranslation?: number;
  upperTranslation?: number;
  maxMotorForce?: number;
  userData?: unknown;
}

interface SerializedRope {
  bodyAId: number | null;
  bodyBId: number | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  links: number;
}

interface SceneData {
  bodies: SerializedBody[];
  joints: SerializedJoint[];
  ropes?: SerializedRope[];
  gravity: number;
}

export interface SavedScene {
  name: string;
  data: SceneData;
  timestamp: number;
}

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

function bodyTypeEnum(name: string) {
  const B2 = b2();
  if (name === "dynamic") return B2.b2BodyType.b2_dynamicBody;
  if (name === "kinematic") return B2.b2BodyType.b2_kinematicBody;
  return B2.b2BodyType.b2_staticBody;
}

// ── Joint serialization ──

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

// ── Serialize / Deserialize ──

function isRopeInternal(pw: PhysWorld, b: Body): boolean {
  const ud = pw.getUserData(b);
  return ud?.label === "ropeLink" || ud?.label === "ropeAnchor";
}

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
    // Resolve body references via index1 lookup
    const bIdA = j.GetBodyA() as unknown as { index1: number };
    const bIdB = j.GetBodyB() as unknown as { index1: number };
    const bA = pw.findBodyByIndex1(bIdA.index1);
    const bB = pw.findBodyByIndex1(bIdB.index1);
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
      bodyAId: ropeBodies.has(bodyA) ? null : -1, // placeholder
      bodyBId: ropeBodies.has(bodyB) ? null : -1,
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

  pw.forEachBody((b) => {
    if (ropeBodies.has(b)) return;

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

    const bA = j.GetBodyA() as unknown as Body;
    const bB = j.GetBodyB() as unknown as Body;
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

  return { bodies, joints, ropes: ropes.length > 0 ? ropes : undefined, gravity: game.gravity };
}

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

    // biome-ignore lint/suspicious/noExplicitAny: userData from deserialized scene data
    if (sb.userData) pw.setUserData(body, sb.userData as any);
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

// ── IndexedDB persistence ──

const DB_NAME = "physbox3";
const STORE_NAME = "scenes";
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function dbTransaction<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | undefined,
): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const result = fn(tx.objectStore(STORE_NAME));
    if (result) {
      result.onsuccess = () => resolve(result.result as T);
      result.onerror = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve(undefined);
      tx.onerror = () => reject(tx.error);
    }
  });
}

export async function saveScene(name: string, game: Game): Promise<void> {
  const scene: SavedScene = { name, data: serializeScene(game), timestamp: Date.now() };
  await dbTransaction("readwrite", (store) => store.put(scene));
}

export async function loadScene(name: string, game: Game): Promise<boolean> {
  const scene = await dbTransaction<SavedScene>("readonly", (store) => store.get(name));
  if (!scene) return false;
  deserializeScene(game, scene.data);
  return true;
}

export async function listScenes(): Promise<SavedScene[]> {
  const scenes = await dbTransaction<SavedScene[]>("readonly", (store) => store.getAll());
  return (scenes ?? []).sort((a, b) => b.timestamp - a.timestamp);
}

export async function deleteScene(name: string): Promise<void> {
  await dbTransaction("readwrite", (store) => store.delete(name));
}
