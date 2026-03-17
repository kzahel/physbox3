import * as planck from "planck";
import { describe, expect, it } from "vitest";
import {
  areWelded,
  bodyRadius,
  clamp,
  createWeldJoint,
  distance,
  getWeldJoints,
  markDestroyed,
  queryBodiesInRadius,
} from "./Physics";

describe("clamp", () => {
  it("returns value when within range", () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it("clamps to min", () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it("clamps to max", () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it("handles equal min and max", () => {
    expect(clamp(5, 3, 3)).toBe(3);
  });

  it("returns boundary values exactly", () => {
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });
});

describe("distance", () => {
  it("returns 0 for same point", () => {
    expect(distance({ x: 3, y: 4 }, { x: 3, y: 4 })).toBe(0);
  });

  it("computes horizontal distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 0 })).toBe(3);
  });

  it("computes diagonal distance", () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
  });

  it("is symmetric", () => {
    const a = { x: 1, y: 2 };
    const b = { x: 4, y: 6 };
    expect(distance(a, b)).toBe(distance(b, a));
  });

  it("handles negative coordinates", () => {
    expect(distance({ x: -1, y: -1 }, { x: 2, y: 3 })).toBe(5);
  });
});

describe("markDestroyed", () => {
  it("sets destroyed flag on body userData", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    body.setUserData({ label: "test" });
    markDestroyed(body);
    expect((body.getUserData() as Record<string, unknown>).destroyed).toBe(true);
  });

  it("creates userData if none exists", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    markDestroyed(body);
    expect((body.getUserData() as Record<string, unknown>).destroyed).toBe(true);
  });
});

describe("weld joint helpers", () => {
  function twoBodyWorld() {
    const world = new planck.World();
    const a = world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    a.createFixture({ shape: planck.Circle(0.5), density: 1 });
    const b = world.createBody({ type: "dynamic", position: planck.Vec2(1, 0) });
    b.createFixture({ shape: planck.Circle(0.5), density: 1 });
    return { world, a, b };
  }

  it("areWelded returns false when no joint exists", () => {
    const { a, b } = twoBodyWorld();
    expect(areWelded(a, b)).toBe(false);
  });

  it("areWelded returns true after creating weld joint", () => {
    const { world, a, b } = twoBodyWorld();
    createWeldJoint(world, a, b, planck.Vec2(0.5, 0));
    expect(areWelded(a, b)).toBe(true);
    expect(areWelded(b, a)).toBe(true);
  });

  it("getWeldJoints returns empty array when no welds", () => {
    const { a } = twoBodyWorld();
    expect(getWeldJoints(a)).toHaveLength(0);
  });

  it("getWeldJoints returns weld joints", () => {
    const { world, a, b } = twoBodyWorld();
    createWeldJoint(world, a, b, planck.Vec2(0.5, 0));
    expect(getWeldJoints(a)).toHaveLength(1);
    expect(getWeldJoints(b)).toHaveLength(1);
  });
});

describe("bodyRadius", () => {
  it("returns circle radius", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic" });
    body.createFixture({ shape: planck.Circle(2.5), density: 1 });
    expect(bodyRadius(body)).toBe(2.5);
  });

  it("returns max radius across multiple fixtures", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic" });
    body.createFixture({ shape: planck.Circle(1), density: 1 });
    body.createFixture({ shape: planck.Circle(3), density: 1 });
    expect(bodyRadius(body)).toBe(3);
  });

  it("returns 0 for body with no fixtures", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic" });
    expect(bodyRadius(body)).toBe(0);
  });

  it("computes radius for polygon fixtures", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic" });
    body.createFixture({ shape: planck.Box(2, 1), density: 1 });
    const r = bodyRadius(body);
    // Box(2,1) → half-extents 2×1, diagonal ≈ √(4²+2²)/2 = √20/2 ≈ 2.236
    expect(r).toBeGreaterThan(2);
    expect(r).toBeLessThan(3);
  });
});

describe("queryBodiesInRadius", () => {
  it("finds bodies within radius", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic", position: planck.Vec2(1, 0) });
    body.createFixture({ shape: planck.Circle(0.5), density: 1 });
    // Far away body
    const far = world.createBody({ type: "dynamic", position: planck.Vec2(100, 0) });
    far.createFixture({ shape: planck.Circle(0.5), density: 1 });

    const found = queryBodiesInRadius(world, 0, 0, 5);
    expect(found).toContain(body);
    expect(found).not.toContain(far);
  });

  it("respects exclude parameter", () => {
    const world = new planck.World();
    const body = world.createBody({ type: "dynamic", position: planck.Vec2(0, 0) });
    body.createFixture({ shape: planck.Circle(0.5), density: 1 });

    const found = queryBodiesInRadius(world, 0, 0, 5, body);
    expect(found).not.toContain(body);
  });
});
