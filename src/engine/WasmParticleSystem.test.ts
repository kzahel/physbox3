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

function createDynamicBox(pw: PhysWorld, x: number, y: number, halfW: number, halfH: number, density = 0.25) {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.motionLocks.angularZ = true;
  const body = pw.createBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = density;
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

  it("respects runtime max particle limit changes", () => {
    const pw = new PhysWorld(0, -10);
    const system = new WasmParticleSystem(pw.world, { maxParticles: 100 });

    system.setMaxParticles(20);
    expect(system.getMaxParticles()).toBe(20);

    const firstBatch = system.spawnCircle({ x: 0, y: 0 }, 0.7, 0.16);
    expect(firstBatch).toBe(20);
    expect(system.getCount()).toBe(20);

    system.setMaxParticles(80);
    expect(system.getMaxParticles()).toBe(80);

    const secondBatch = system.spawnCircle({ x: 2, y: 0 }, 0.7, 0.16);
    expect(secondBatch).toBeGreaterThan(0);
    expect(system.getCount()).toBe(firstBatch + secondBatch);
    expect(system.getCount()).toBeLessThanOrEqual(80);

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

  it("pushes a light dynamic body during combined stepping", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4, 1);
    createStaticBox(pw, -4, 2, 1, 4);
    createStaticBox(pw, 4, 2, 1, 4);

    const body = createDynamicBox(pw, 0.75, 0.25, 0.25, 0.25, 0.12);
    const startX = body.GetPosition().x;

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: -1.35, y: 0.95 }, 0.8, 0.16);
    expect(created).toBeGreaterThan(0);

    for (let i = 0; i < 180; i++) {
      system.stepWithWorld(1 / 60, 4);
      pw.syncAfterStep();
    }

    const endX = body.GetPosition().x;
    expect(endX).toBeGreaterThan(startX + 0.05);
    expect(system.getCount()).toBe(created);

    system.destroy();
    pw.destroy();
  });
});
