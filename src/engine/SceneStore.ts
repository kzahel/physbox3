import * as planck from "planck";
import type { Game } from "./Game";

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
}

interface SceneData {
  bodies: SerializedBody[];
  joints: SerializedJoint[];
  gravity: number;
}

export interface SavedScene {
  name: string;
  data: SceneData;
  timestamp: number;
}

// ── Serialize / Deserialize ──

export function serializeScene(game: Game): SceneData {
  const bodyMap = new Map<planck.Body, number>();
  const bodies: SerializedBody[] = [];
  let nextId = 0;

  for (let b = game.world.getBodyList(); b; b = b.getNext()) {
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
  }

  const joints: SerializedJoint[] = [];
  for (let j = game.world.getJointList(); j; j = j.getNext()) {
    const bodyAId = bodyMap.get(j.getBodyA());
    const bodyBId = bodyMap.get(j.getBodyB());
    if (bodyAId === undefined || bodyBId === undefined) continue;

    const anchor = j.getAnchorA();
    joints.push({
      type: j.getType(),
      bodyA: bodyAId,
      bodyB: bodyBId,
      anchorX: anchor.x,
      anchorY: anchor.y,
    });
  }

  return { bodies, joints, gravity: game.gravity };
}

export function deserializeScene(game: Game, data: SceneData) {
  // Clear everything
  const bodiesToRemove: planck.Body[] = [];
  for (let b = game.world.getBodyList(); b; b = b.getNext()) {
    bodiesToRemove.push(b);
  }
  for (const b of bodiesToRemove) game.world.destroyBody(b);

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

    const anchor = planck.Vec2(sj.anchorX, sj.anchorY);
    switch (sj.type) {
      case "weld-joint":
        game.world.createJoint(planck.WeldJoint({}, bodyA, bodyB, anchor));
        break;
      case "revolute-joint":
        game.world.createJoint(planck.RevoluteJoint({}, bodyA, bodyB, anchor));
        break;
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

export async function saveScene(name: string, game: Game): Promise<void> {
  const db = await openDB();
  const scene: SavedScene = {
    name,
    data: serializeScene(game),
    timestamp: Date.now(),
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(scene);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadScene(name: string, game: Game): Promise<boolean> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(name);
    req.onsuccess = () => {
      const scene = req.result as SavedScene | undefined;
      if (!scene) {
        resolve(false);
        return;
      }
      deserializeScene(game, scene.data);
      resolve(true);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function listScenes(): Promise<SavedScene[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => {
      const scenes = (req.result as SavedScene[]).sort((a, b) => b.timestamp - a.timestamp);
      resolve(scenes);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteScene(name: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
