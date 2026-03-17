import * as planck from "planck";
import { describe, expect, it } from "vitest";
import { createPolygon } from "./Polygon";

describe("createPolygon", () => {
  function makeWorld() {
    return new planck.World();
  }

  it("returns null for fewer than 3 points", () => {
    const world = makeWorld();
    expect(createPolygon(world, [])).toBeNull();
    expect(createPolygon(world, [{ x: 0, y: 0 }])).toBeNull();
    expect(
      createPolygon(world, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBeNull();
  });

  it("returns null for collinear points", () => {
    const world = makeWorld();
    const result = createPolygon(world, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for very small polygons", () => {
    const world = makeWorld();
    const result = createPolygon(world, [
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
      { x: 0, y: 0.001 },
    ]);
    expect(result).toBeNull();
  });

  it("creates a triangle", () => {
    const world = makeWorld();
    const body = createPolygon(world, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(body).not.toBeNull();
    expect(body!.isDynamic()).toBe(true);
    const ud = body!.getUserData() as Record<string, unknown>;
    expect(ud.label).toBe("polygon");
  });

  it("creates a polygon from many points (simplifies to <= 8 verts)", () => {
    const world = makeWorld();
    // 20-sided polygon
    const pts = Array.from({ length: 20 }, (_, i) => ({
      x: Math.cos((i * 2 * Math.PI) / 20) * 3,
      y: Math.sin((i * 2 * Math.PI) / 20) * 3,
    }));
    const body = createPolygon(world, pts);
    expect(body).not.toBeNull();
    // Should have been simplified to ≤ 8 vertices (Planck limit)
    const fixture = body!.getFixtureList()!;
    const shape = fixture.getShape() as planck.PolygonShape;
    expect(shape.m_vertices.length).toBeLessThanOrEqual(8);
  });

  it("positions body at centroid of hull", () => {
    const world = makeWorld();
    const body = createPolygon(world, [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
    ]);
    expect(body).not.toBeNull();
    const pos = body!.getPosition();
    expect(pos.x).toBeCloseTo(3);
    expect(pos.y).toBeCloseTo(3);
  });

  it("handles points with interior points (convex hull filters them)", () => {
    const world = makeWorld();
    const body = createPolygon(world, [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 4 },
      { x: 2, y: 2 }, // interior point
      { x: 1, y: 1 }, // interior point
    ]);
    expect(body).not.toBeNull();
  });
});
