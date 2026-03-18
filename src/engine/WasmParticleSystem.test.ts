import { beforeAll, describe, expect, it } from "vitest";
import { b2, initBox2D } from "./Box2D";
import { PhysWorld } from "./PhysWorld";
import { WasmParticleSystem } from "./WasmParticleSystem";

beforeAll(async () => {
  await initBox2D();
});

function createStaticBox(pw: PhysWorld, x: number, y: number, halfW: number, halfH: number) {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(halfW, halfH));
  return body;
}

function computeBounds(buffer: Float32Array) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < buffer.length; i += 2) {
    minX = Math.min(minX, buffer[i]);
    maxX = Math.max(maxX, buffer[i]);
    minY = Math.min(minY, buffer[i + 1]);
    maxY = Math.max(maxY, buffer[i + 1]);
  }

  return { minX, maxX, minY, maxY };
}

describe("WasmParticleSystem bridge contract", () => {
  it("does not spawn particles inside rigid shapes", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, 0, 1, 1);

    const system = new WasmParticleSystem(pw.world);
    const openCount = system.spawnCircle({ x: 0, y: 3 }, 0.7, 0.16);
    const blockedCount = system.spawnCircle({ x: 0, y: 0 }, 0.7, 0.16);

    expect(openCount).toBeGreaterThan(0);
    expect(blockedCount).toBe(0);

    system.destroy();
    pw.destroy();
  });
});

describe("WasmParticleSystem scenarios", () => {
  it("settles particles inside a box and supports erase", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 3, 1);
    createStaticBox(pw, -3, 2, 1, 4);
    createStaticBox(pw, 3, 2, 1, 4);

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: 0, y: 2.5 }, 0.7, 0.16);
    expect(created).toBeGreaterThan(0);

    for (let i = 0; i < 60; i++) {
      system.stepWithWorld(1 / 60, 4);
      pw.syncAfterStep();
    }

    const settledBuffer = system.getPositionBuffer();
    const settledBounds = computeBounds(settledBuffer);

    expect(system.getCount()).toBe(created);
    expect(settledBounds.minY).toBeGreaterThanOrEqual(system.getParticleRadius() - 0.02);
    expect(settledBounds.minX).toBeGreaterThan(-2.1);
    expect(settledBounds.maxX).toBeLessThan(2.1);

    const removed = system.destroyCircle({ x: 0, y: 0.25 }, 0.3);
    expect(removed).toBeGreaterThan(0);
    expect(system.getCount()).toBe(created - removed);

    const erasedBuffer = system.getPositionBuffer();
    expect(erasedBuffer.length).toBe(system.getCount() * 2);

    system.stepWithWorld(1 / 60, 4);
    pw.syncAfterStep();
    expect(system.getCount()).toBe(created - removed);

    system.destroy();
    pw.destroy();
  });
});
