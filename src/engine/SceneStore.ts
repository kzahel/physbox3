import * as planck from "planck";

import { createRopeBetween } from "../prefabs/Rope";
import type { Game } from "./Game";
import { createWeldJoint, forEachBody, markDestroyed } from "./Physics";

// ── Serialization types ──

interface SerializedFixture {
  shape: "box" | "circle" | "polygon" | "edge";
  // Box: halfWidth, halfHeight; Circle: radius
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
  fixtures: SerializedFixture[];
  userData: unknown;
}

interface SerializedJoint {
  type: string;
  bodyA: number;
  bodyB: number;
  anchorX: number;
  anchorY: number;
  // Second anchor (for distance joints etc.)
  anchorBX?: number;
  anchorBY?: number;
  // DistanceJoint
  frequencyHz?: number;
  dampingRatio?: number;
  length?: number;
  collideConnected?: boolean;
  // RevoluteJoint
  enableLimit?: boolean;
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
  // RopeJoint
  maxLength?: number;
  userData?: unknown;
}

interface SerializedRope {
  bodyAId: number | null; // null = standalone static anchor
  bodyBId: number | null;
  x1: number;
  y1: number; // world-space attachment point A
  x2: number;
  y2: number; // world-space attachment point B
  links: number; // number of chain links (preserved exactly on load)
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

// ── Joint serialization registry ──

interface JointCodec {
  serialize(j: planck.Joint, sj: SerializedJoint): void;
  deserialize(
    sj: SerializedJoint,
    bodyA: planck.Body,
    bodyB: planck.Body,
    anchorA: planck.Vec2,
    anchorB: planck.Vec2,
    world: planck.World,
  ): void;
}

function readLocalAxis(j: planck.Joint): { x: number; y: number } | null {
  const axis = (j as any).m_localXAxisA;
  return axis ? { x: axis.x, y: axis.y } : null;
}

const JOINT_CODECS: Record<string, JointCodec> = {
  "weld-joint": {
    serialize() {},
    deserialize(sj, bodyA, bodyB, anchorA, _anchorB, world) {
      createWeldJoint(world, bodyA, bodyB, anchorA, { collideConnected: sj.collideConnected });
    },
  },
  "revolute-joint": {
    serialize(j, sj) {
      const rj = j as planck.RevoluteJoint;
      sj.enableLimit = rj.isLimitEnabled();
      sj.lowerAngle = rj.getLowerLimit();
      sj.upperAngle = rj.getUpperLimit();
      sj.enableMotor = rj.isMotorEnabled();
      sj.motorSpeed = rj.getMotorSpeed();
      sj.maxMotorTorque = rj.getMaxMotorTorque();
    },
    deserialize(sj, bodyA, bodyB, anchorA, _anchorB, world) {
      world.createJoint(
        planck.RevoluteJoint(
          {
            collideConnected: sj.collideConnected,
            enableLimit: sj.enableLimit,
            lowerAngle: sj.lowerAngle,
            upperAngle: sj.upperAngle,
            enableMotor: sj.enableMotor,
            motorSpeed: sj.motorSpeed,
            maxMotorTorque: sj.maxMotorTorque,
          },
          bodyA,
          bodyB,
          anchorA,
        ),
      );
    },
  },
  "distance-joint": {
    serialize(j, sj) {
      const dj = j as planck.DistanceJoint;
      sj.frequencyHz = dj.getFrequency();
      sj.dampingRatio = dj.getDampingRatio();
      sj.length = dj.getLength();
    },
    deserialize(sj, bodyA, bodyB, anchorA, anchorB, world) {
      const joint = planck.DistanceJoint(
        {
          frequencyHz: sj.frequencyHz,
          dampingRatio: sj.dampingRatio,
          length: sj.length,
          collideConnected: sj.collideConnected ?? true,
        },
        bodyA,
        bodyB,
        anchorA,
        anchorB,
      );
      // Set local anchors precisely (mirrors Game.addSpring)
      const localA = bodyA.getLocalPoint(anchorA);
      const localB = bodyB.getLocalPoint(anchorB);
      (joint as any).m_localAnchorA = localA;
      (joint as any).m_localAnchorB = localB;
      world.createJoint(joint);
    },
  },
  "wheel-joint": {
    serialize(j, sj) {
      const wj = j as planck.WheelJoint;
      sj.enableMotor = wj.isMotorEnabled();
      sj.motorSpeed = wj.getMotorSpeed();
      sj.maxMotorTorque = wj.getMaxMotorTorque();
      sj.frequencyHz = wj.getSpringFrequencyHz();
      sj.dampingRatio = wj.getSpringDampingRatio();
      const axis = readLocalAxis(wj);
      if (axis) {
        sj.axisX = axis.x;
        sj.axisY = axis.y;
      }
    },
    deserialize(sj, bodyA, bodyB, _anchorA, anchorB, world) {
      world.createJoint(
        planck.WheelJoint(
          {
            enableMotor: sj.enableMotor,
            motorSpeed: sj.motorSpeed,
            maxMotorTorque: sj.maxMotorTorque,
            frequencyHz: sj.frequencyHz,
            dampingRatio: sj.dampingRatio,
            collideConnected: sj.collideConnected,
          },
          bodyA,
          bodyB,
          anchorB,
          planck.Vec2(sj.axisX ?? 0, sj.axisY ?? 1),
        ),
      );
    },
  },
  "rope-joint": {
    serialize(j, sj) {
      const rj = j as planck.RopeJoint;
      sj.maxLength = rj.getMaxLength();
      sj.userData = j.getUserData();
    },
    deserialize(sj, bodyA, bodyB, anchorA, anchorB, world) {
      const localA = bodyA.getLocalPoint(anchorA);
      const localB = bodyB.getLocalPoint(anchorB);
      world.createJoint(
        new planck.RopeJoint({
          bodyA,
          bodyB,
          localAnchorA: localA,
          localAnchorB: localB,
          maxLength: sj.maxLength ?? 0,
          collideConnected: sj.collideConnected,
          userData: sj.userData,
        } as planck.RopeJointDef),
      );
    },
  },
  "prismatic-joint": {
    serialize(j, sj) {
      const pj = j as planck.PrismaticJoint;
      sj.enableLimit = pj.isLimitEnabled();
      sj.lowerTranslation = pj.getLowerLimit();
      sj.upperTranslation = pj.getUpperLimit();
      sj.enableMotor = pj.isMotorEnabled();
      sj.motorSpeed = pj.getMotorSpeed();
      sj.maxMotorForce = pj.getMaxMotorForce();
      const axis = readLocalAxis(pj);
      if (axis) {
        sj.axisX = axis.x;
        sj.axisY = axis.y;
      }
    },
    deserialize(sj, bodyA, bodyB, anchorA, _anchorB, world) {
      world.createJoint(
        planck.PrismaticJoint(
          {
            enableLimit: sj.enableLimit,
            lowerTranslation: sj.lowerTranslation,
            upperTranslation: sj.upperTranslation,
            enableMotor: sj.enableMotor,
            motorSpeed: sj.motorSpeed,
            maxMotorForce: sj.maxMotorForce,
            collideConnected: sj.collideConnected,
          },
          bodyA,
          bodyB,
          anchorA,
          planck.Vec2(sj.axisX ?? 1, sj.axisY ?? 0),
        ),
      );
    },
  },
};

// ── Serialize / Deserialize ──

/** Check if a body is part of a rope's internal structure */
function isRopeInternal(b: planck.Body): boolean {
  const ud = b.getUserData() as { label?: string } | null;
  return ud?.label === "ropeLink" || ud?.label === "ropeAnchor";
}

export function serializeScene(game: Game): SceneData {
  // ── Identify rope components to exclude from normal serialization ──
  const ropeBodies = new Set<planck.Body>();
  const ropeJoints = new Set<planck.Joint>();
  const ropes: SerializedRope[] = [];

  // First: find all rope-internal bodies
  forEachBody(game.world, (b) => {
    if (isRopeInternal(b)) ropeBodies.add(b);
  });

  // Find main RopeJoints to extract rope metadata, and mark all rope-related joints
  for (let j = game.world.getJointList(); j; j = j.getNext()) {
    const ud = j.getUserData() as { ropeStabilizer?: boolean; isMainRope?: boolean } | null;

    // All stabilizer/rope joints (main + interior) are rope-internal
    if (ud?.ropeStabilizer) {
      ropeJoints.add(j);
      continue;
    }

    // RevoluteJoints between rope links are rope-internal
    const bA = j.getBodyA();
    const bB = j.getBodyB();
    if (ropeBodies.has(bA) || ropeBodies.has(bB)) {
      ropeJoints.add(j);
    }
  }

  // Extract rope metadata from main RopeJoints
  // (second pass so all ropeBodies are identified first)
  for (let j = game.world.getJointList(); j; j = j.getNext()) {
    const ud = j.getUserData() as {
      ropeStabilizer?: boolean;
      isMainRope?: boolean;
      chainBodies?: planck.Body[];
    } | null;
    if (!ud?.isMainRope) continue;

    const bA = j.getBodyA();
    const bB = j.getBodyB();
    const anchorA = bA.getWorldPoint((j as any).m_localAnchorA);
    const anchorB = bB.getWorldPoint((j as any).m_localAnchorB);

    // chainBodies has links-1 interior bodies; total links = chainBodies.length + 1
    const links = (ud.chainBodies?.length ?? 0) + 1;

    // bodyA/bodyB: null if rope-created anchor, will be resolved to ID below
    ropes.push({
      bodyAId: ropeBodies.has(bA) ? null : -1, // placeholder, resolved after bodyMap built
      bodyBId: ropeBodies.has(bB) ? null : -1,
      x1: anchorA.x,
      y1: anchorA.y,
      x2: anchorB.x,
      y2: anchorB.y,
      links,
      _bodyA: ropeBodies.has(bA) ? null : bA,
      _bodyB: ropeBodies.has(bB) ? null : bB,
    } as any);
  }

  // ── Serialize non-rope bodies ──
  const bodyMap = new Map<planck.Body, number>();
  const bodies: SerializedBody[] = [];
  let nextId = 0;

  forEachBody(game.world, (b) => {
    if (ropeBodies.has(b)) return;

    const id = nextId++;
    bodyMap.set(b, id);

    const fixtures: SerializedFixture[] = [];
    for (let f = b.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      const fd: SerializedFixture = {
        shape: "box",
        params: [],
        density: f.getDensity(),
        friction: f.getFriction(),
        restitution: f.getRestitution(),
      };

      if (shape.getType() === "circle") {
        fd.shape = "circle";
        fd.params = [(shape as planck.CircleShape).getRadius()];
      } else if (shape.getType() === "polygon") {
        const poly = shape as planck.PolygonShape;
        const verts = poly.m_vertices;
        // Detect axis-aligned box (4 verts, symmetric about origin)
        if (verts.length === 4) {
          let maxX = 0,
            maxY = 0;
          for (const v of verts) {
            maxX = Math.max(maxX, Math.abs(v.x));
            maxY = Math.max(maxY, Math.abs(v.y));
          }
          fd.shape = "box";
          fd.params = [maxX, maxY];
        } else {
          fd.shape = "polygon";
          fd.params = verts.flatMap((v) => [v.x, v.y]);
        }
      } else if (shape.getType() === "edge") {
        fd.shape = "edge";
        const edge = shape as planck.EdgeShape;
        fd.params = [edge.m_vertex1.x, edge.m_vertex1.y, edge.m_vertex2.x, edge.m_vertex2.y];
      }

      fixtures.push(fd);
    }

    const pos = b.getPosition();
    bodies.push({
      id,
      type: b.getType() as "static" | "dynamic" | "kinematic",
      x: pos.x,
      y: pos.y,
      angle: b.getAngle(),
      fixtures,
      userData: b.getUserData(),
    });
  });

  // Resolve rope body references to IDs
  for (const r of ropes) {
    const raw = r as any;
    r.bodyAId = raw._bodyA ? (bodyMap.get(raw._bodyA) ?? null) : null;
    r.bodyBId = raw._bodyB ? (bodyMap.get(raw._bodyB) ?? null) : null;
    delete raw._bodyA;
    delete raw._bodyB;
  }

  // ── Serialize non-rope joints ──
  const joints: SerializedJoint[] = [];
  for (let j = game.world.getJointList(); j; j = j.getNext()) {
    if (ropeJoints.has(j)) continue;

    const bodyAId = bodyMap.get(j.getBodyA());
    const bodyBId = bodyMap.get(j.getBodyB());
    if (bodyAId === undefined || bodyBId === undefined) continue;

    const anchorA = j.getAnchorA();
    const anchorB = j.getAnchorB();
    const sj: SerializedJoint = {
      type: j.getType(),
      bodyA: bodyAId,
      bodyB: bodyBId,
      anchorX: anchorA.x,
      anchorY: anchorA.y,
      anchorBX: anchorB.x,
      anchorBY: anchorB.y,
      collideConnected: j.getCollideConnected(),
    };

    JOINT_CODECS[j.getType()]?.serialize(j, sj);

    joints.push(sj);
  }

  return { bodies, joints, ropes: ropes.length > 0 ? ropes : undefined, gravity: game.gravity };
}

export function deserializeScene(game: Game, data: SceneData) {
  // Clear everything
  const bodiesToRemove: planck.Body[] = [];
  forEachBody(game.world, (b) => bodiesToRemove.push(b));
  for (const b of bodiesToRemove) {
    markDestroyed(b);
    game.world.destroyBody(b);
  }

  game.setGravity(data.gravity);

  const idToBody = new Map<number, planck.Body>();

  for (const sb of data.bodies) {
    const body = game.world.createBody({
      type: sb.type,
      position: planck.Vec2(sb.x, sb.y),
      angle: sb.angle,
    });

    for (const sf of sb.fixtures) {
      let shape: planck.Shape;
      switch (sf.shape) {
        case "circle":
          shape = planck.Circle(sf.params[0]);
          break;
        case "box":
          shape = planck.Box(sf.params[0], sf.params[1]);
          break;
        case "polygon": {
          const verts: planck.Vec2Value[] = [];
          for (let i = 0; i < sf.params.length; i += 2) {
            verts.push(planck.Vec2(sf.params[i], sf.params[i + 1]));
          }
          shape = planck.Polygon(verts);
          break;
        }
        case "edge":
          shape = planck.Edge(planck.Vec2(sf.params[0], sf.params[1]), planck.Vec2(sf.params[2], sf.params[3]));
          break;
        default:
          continue;
      }
      body.createFixture({
        shape,
        density: sf.density,
        friction: sf.friction,
        restitution: sf.restitution,
      });
    }

    if (sb.userData) body.setUserData(sb.userData);
    idToBody.set(sb.id, body);
  }

  // Recreate joints
  for (const sj of data.joints) {
    const bodyA = idToBody.get(sj.bodyA);
    const bodyB = idToBody.get(sj.bodyB);
    if (!bodyA || !bodyB) continue;

    const anchorA = planck.Vec2(sj.anchorX, sj.anchorY);
    const anchorB = planck.Vec2(sj.anchorBX ?? sj.anchorX, sj.anchorBY ?? sj.anchorY);

    JOINT_CODECS[sj.type]?.deserialize(sj, bodyA, bodyB, anchorA, anchorB, game.world);
  }

  // Recreate ropes from metadata (recipe-based, not physics state)
  if (data.ropes) {
    for (const r of data.ropes) {
      const bodyA = r.bodyAId !== null ? (idToBody.get(r.bodyAId) ?? null) : null;
      const bodyB = r.bodyBId !== null ? (idToBody.get(r.bodyBId) ?? null) : null;
      createRopeBetween(game.world, r.x1, r.y1, r.x2, r.y2, bodyA, bodyB, r.links);
    }
  }

  // Re-create the InputManager ground body
  if (game.inputManager) {
    (game.inputManager as unknown as { groundBody: planck.Body }).groundBody = game.world.createBody({
      type: "static",
    });
  }
}

// ── IndexedDB persistence ──

const DB_NAME = "physbox2";
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

/** Run a callback against the object store and resolve when the transaction completes. */
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
