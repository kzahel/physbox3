import type { Game } from "./Game";
import { deserializeScene } from "./SceneDeserializer";
import { serializeScene } from "./SceneSerializer";

// ── Serialization types ──

export interface SerializedShape {
  type: "circle" | "box" | "polygon" | "segment";
  params: number[];
  density: number;
  friction: number;
  restitution: number;
}

export interface SerializedBody {
  id: number;
  type: "static" | "dynamic" | "kinematic";
  x: number;
  y: number;
  angle: number;
  shapes: SerializedShape[];
  userData: unknown;
}

export interface SerializedJoint {
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

export interface SerializedRope {
  bodyAId: number | null;
  bodyBId: number | null;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  links: number;
}

export interface SceneData {
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

export { deserializeScene } from "./SceneDeserializer";
// Re-export serialize/deserialize for existing consumers
export { serializeScene } from "./SceneSerializer";

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
