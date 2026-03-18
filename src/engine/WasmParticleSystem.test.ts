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

function createKinematicBox(pw: PhysWorld, x: number, y: number, halfW: number, halfH: number, vx = 0, vy = 0) {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_kinematicBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.linearVelocity = new B2.b2Vec2(vx, vy);
  bodyDef.motionLocks.angularZ = true;
  const body = pw.createBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(halfW, halfH));
  return body;
}

function createStaticCapsule(
  pw: PhysWorld,
  x: number,
  y: number,
  point1: { x: number; y: number },
  point2: { x: number; y: number },
  radius: number,
) {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  const capsule = new B2.b2Capsule();
  capsule.center1 = new B2.b2Vec2(point1.x, point1.y);
  capsule.center2 = new B2.b2Vec2(point2.x, point2.y);
  capsule.radius = radius;
  body.CreateCapsuleShape(shapeDef, capsule);
  return body;
}

function createStaticSegment(
  pw: PhysWorld,
  x: number,
  y: number,
  point1: { x: number; y: number },
  point2: { x: number; y: number },
) {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  const body = pw.createBody(bodyDef);
  const shapeDef = B2.b2DefaultShapeDef();
  const segment = new B2.b2Segment();
  segment.point1 = new B2.b2Vec2(point1.x, point1.y);
  segment.point2 = new B2.b2Vec2(point2.x, point2.y);
  body.CreateSegmentShape(shapeDef, segment);
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

function computeCentroid(buffer: Float32Array) {
  let sumX = 0;
  let sumY = 0;
  const count = buffer.length / 2;
  for (let i = 0; i < buffer.length; i += 2) {
    sumX += buffer[i];
    sumY += buffer[i + 1];
  }
  return {
    x: count > 0 ? sumX / count : 0,
    y: count > 0 ? sumY / count : 0,
  };
}

function countParticles(buffer: Float32Array, predicate: (x: number, y: number) => boolean) {
  let count = 0;
  for (let i = 0; i < buffer.length; i += 2) {
    if (predicate(buffer[i], buffer[i + 1])) count++;
  }
  return count;
}

function areParticlesFinite(buffer: Float32Array) {
  for (let i = 0; i < buffer.length; i += 2) {
    if (!Number.isFinite(buffer[i]) || !Number.isFinite(buffer[i + 1])) return false;
  }
  return true;
}

function distanceToSegment(
  point: { x: number; y: number },
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(point.x - start.x, point.y - start.y);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq));
  const closestX = start.x + dx * t;
  const closestY = start.y + dy * t;
  return Math.hypot(point.x - closestX, point.y - closestY);
}

function stepSystem(pw: PhysWorld, system: WasmParticleSystem, steps: number, timeStep = 1 / 60, subSteps = 4) {
  for (let i = 0; i < steps; i++) {
    system.stepWithWorld(timeStep, subSteps);
    pw.syncAfterStep();
  }
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

  it("keeps particles out of supported capsule contacts", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4, 1);
    createStaticBox(pw, -4, 2, 1, 4);
    createStaticBox(pw, 4, 2, 1, 4);
    createStaticCapsule(pw, 0, 0.8, { x: -1.1, y: 0 }, { x: 1.1, y: 0 }, 0.32);

    const system = new WasmParticleSystem(pw.world);
    const blockedCount = system.spawnCircle({ x: 0, y: 0.8 }, 0.14, 0.08);
    const created = system.spawnCircle({ x: 0, y: 2.8 }, 0.8, 0.16);

    expect(blockedCount).toBe(0);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 180);

    const buffer = system.getPositionBuffer();
    const capsuleStart = { x: -1.1, y: 0.8 };
    const capsuleEnd = { x: 1.1, y: 0.8 };
    const minClearance = 0.32 + system.getParticleRadius() - 0.06;

    expect(system.getCount()).toBe(created);
    expect(areParticlesFinite(buffer)).toBe(true);
    for (let i = 0; i < buffer.length; i += 2) {
      expect(distanceToSegment({ x: buffer[i], y: buffer[i + 1] }, capsuleStart, capsuleEnd)).toBeGreaterThanOrEqual(
        minClearance,
      );
    }

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

  it("slides particles along a supported segment ramp without leaking through", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4, 1);
    createStaticBox(pw, -4, 2, 1, 4);
    createStaticBox(pw, 4, 2, 1, 4);
    createStaticSegment(pw, 0, 0, { x: -2.3, y: 1.8 }, { x: 1.2, y: 0.35 });

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: -1.9, y: 2.8 }, 0.75, 0.16);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 200);

    const buffer = system.getPositionBuffer();
    const centroid = computeCentroid(buffer);
    const bounds = computeBounds(buffer);
    const rightCount = countParticles(buffer, (x) => x > 0.5);
    const farLeftCount = countParticles(buffer, (x) => x < -1.2);

    expect(system.getCount()).toBe(created);
    expect(areParticlesFinite(buffer)).toBe(true);
    expect(bounds.minY).toBeGreaterThanOrEqual(system.getParticleRadius() - 0.03);
    expect(centroid.x).toBeGreaterThan(-0.45);
    expect(rightCount).toBeGreaterThan(farLeftCount);

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

  it("spills around a central obstacle into both sides of a container", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4.5, 1);
    createStaticBox(pw, -4.5, 2, 1, 4);
    createStaticBox(pw, 4.5, 2, 1, 4);
    createStaticBox(pw, 0, 0.9, 0.45, 1.15);

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: 0, y: 3.3 }, 0.95, 0.16);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 240);

    const buffer = system.getPositionBuffer();
    const bounds = computeBounds(buffer);
    const leftCount = countParticles(buffer, (x, y) => x < -0.75 && y < 2.2);
    const rightCount = countParticles(buffer, (x, y) => x > 0.75 && y < 2.2);

    expect(system.getCount()).toBe(created);
    expect(areParticlesFinite(buffer)).toBe(true);
    expect(bounds.minY).toBeGreaterThanOrEqual(system.getParticleRadius() - 0.03);
    expect(bounds.minX).toBeGreaterThan(-3.7);
    expect(bounds.maxX).toBeLessThan(3.7);
    expect(leftCount).toBeGreaterThan(10);
    expect(rightCount).toBeGreaterThan(10);

    system.destroy();
    pw.destroy();
  });

  it("settles across a wider container footprint", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 5.5, 1);
    createStaticBox(pw, -5.5, 2.5, 1, 4.5);
    createStaticBox(pw, 5.5, 2.5, 1, 4.5);

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: 0, y: 4.1 }, 1.1, 0.16);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 260);

    const buffer = system.getPositionBuffer();
    const bounds = computeBounds(buffer);

    expect(system.getCount()).toBe(created);
    expect(areParticlesFinite(buffer)).toBe(true);
    expect(bounds.minY).toBeGreaterThanOrEqual(system.getParticleRadius() - 0.03);
    expect(bounds.minX).toBeGreaterThan(-4.8);
    expect(bounds.maxX).toBeLessThan(4.8);
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(4.8);

    system.destroy();
    pw.destroy();
  });

  it("maintains max-particle limits across repeated spawn and erase cycles", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4, 1);
    createStaticBox(pw, -4, 2, 1, 4);
    createStaticBox(pw, 4, 2, 1, 4);

    const system = new WasmParticleSystem(pw.world, { maxParticles: 60 });
    const firstBatch = system.spawnCircle({ x: 0, y: 2.3 }, 0.8, 0.16);
    expect(firstBatch).toBe(60);
    expect(system.getCount()).toBe(60);

    stepSystem(pw, system, 45);

    const firstRemoved = system.destroyCircle({ x: 0, y: 1.2 }, 0.55);
    expect(firstRemoved).toBeGreaterThan(0);
    expect(system.getCount()).toBe(60 - firstRemoved);

    system.setMaxParticles(system.getCount() + 6);
    const secondBatch = system.spawnCircle({ x: 1.4, y: 2.6 }, 0.7, 0.16);
    expect(secondBatch).toBeGreaterThan(0);
    expect(system.getCount()).toBeLessThanOrEqual(system.getMaxParticles());

    stepSystem(pw, system, 30);

    const secondRemoved = system.destroyCircle({ x: 1.2, y: 1.3 }, 0.65);
    expect(secondRemoved).toBeGreaterThan(0);

    system.setMaxParticles(60);
    const thirdBatch = system.spawnCircle({ x: -1.4, y: 2.6 }, 0.75, 0.16);
    expect(thirdBatch).toBeGreaterThan(0);
    expect(system.getCount()).toBeLessThanOrEqual(60);
    expect(system.getPositionBuffer().length).toBe(system.getCount() * 2);

    system.destroy();
    pw.destroy();
  });

  it("supports erase, respawn, and continued stepping without buffer corruption", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4, 1);
    createStaticBox(pw, -4, 2, 1, 4);
    createStaticBox(pw, 4, 2, 1, 4);

    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: -1.1, y: 2.9 }, 0.8, 0.16);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 100);

    const removed = system.destroyCircle({ x: -1.0, y: 0.9 }, 0.65);
    expect(removed).toBeGreaterThan(0);

    const respawned = system.spawnCircle({ x: 1.5, y: 2.8 }, 0.75, 0.16);
    expect(respawned).toBeGreaterThan(0);

    stepSystem(pw, system, 140);

    const buffer = system.getPositionBuffer();
    const bounds = computeBounds(buffer);
    const leftCount = countParticles(buffer, (x) => x < -0.5);
    const rightCount = countParticles(buffer, (x) => x > 0.5);

    expect(system.getCount()).toBe(created - removed + respawned);
    expect(buffer.length).toBe(system.getCount() * 2);
    expect(areParticlesFinite(buffer)).toBe(true);
    expect(bounds.minY).toBeGreaterThanOrEqual(system.getParticleRadius() - 0.03);
    expect(bounds.minX).toBeGreaterThan(-3.3);
    expect(bounds.maxX).toBeLessThan(3.3);
    expect(leftCount).toBeGreaterThan(0);
    expect(rightCount).toBeGreaterThan(0);

    system.destroy();
    pw.destroy();
  });

  it("displaces settled particles around a sweeping kinematic body", () => {
    const pw = new PhysWorld(0, -10);
    createStaticBox(pw, 0, -1, 4.5, 1);
    createStaticBox(pw, -4.5, 2, 1, 4);
    createStaticBox(pw, 4.5, 2, 1, 4);

    const body = createKinematicBox(pw, -2.7, 0.55, 0.65, 0.18);
    const system = new WasmParticleSystem(pw.world);
    const created = system.spawnCircle({ x: 0, y: 2.7 }, 0.9, 0.16);
    expect(created).toBeGreaterThan(0);

    stepSystem(pw, system, 100);
    const beforeSweep = computeCentroid(system.getPositionBuffer());
    const startX = body.GetPosition().x;

    body.SetLinearVelocity(new (b2()).b2Vec2(1.35, 0));
    stepSystem(pw, system, 120);
    body.SetLinearVelocity(new (b2()).b2Vec2(0, 0));

    const buffer = system.getPositionBuffer();
    const afterSweep = computeCentroid(buffer);
    const bodyX = body.GetPosition().x;

    expect(system.getCount()).toBe(created);
    expect(areParticlesFinite(buffer)).toBe(true);
    expect(bodyX).toBeGreaterThan(startX + 1.8);
    expect(afterSweep.x).toBeGreaterThan(beforeSweep.x + 0.12);

    system.destroy();
    pw.destroy();
  });
});
