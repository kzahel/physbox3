import type { b2ShapeId } from "box2d3";
import { beforeAll, describe, expect, it } from "vitest";
import { b2, initBox2D } from "../engine/Box2D";
import { isDynamic } from "../engine/Physics";
import { PhysWorld } from "../engine/PhysWorld";
import { createPolygon } from "./Polygon";

beforeAll(async () => {
  await initBox2D();
});

describe("createPolygon", () => {
  function makePw() {
    return new PhysWorld(0, -10);
  }

  it("returns null for fewer than 3 points", () => {
    const pw = makePw();
    expect(createPolygon(pw, [])).toBeNull();
    expect(createPolygon(pw, [{ x: 0, y: 0 }])).toBeNull();
    expect(
      createPolygon(pw, [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      ]),
    ).toBeNull();
  });

  it("returns null for collinear points", () => {
    const pw = makePw();
    const result = createPolygon(pw, [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ]);
    expect(result).toBeNull();
  });

  it("returns null for very small polygons", () => {
    const pw = makePw();
    const result = createPolygon(pw, [
      { x: 0, y: 0 },
      { x: 0.001, y: 0 },
      { x: 0, y: 0.001 },
    ]);
    expect(result).toBeNull();
  });

  it("creates a triangle", () => {
    const pw = makePw();
    const body = createPolygon(pw, [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 2 },
    ]);
    expect(body).not.toBeNull();
    expect(isDynamic(body!)).toBe(true);
    const ud = pw.getUserData(body!);
    expect(ud?.label).toBe("polygon");
  });

  it("creates a polygon from many points (simplifies to <= 8 verts)", () => {
    const pw = makePw();
    const B2 = b2();
    // 20-sided polygon
    const pts = Array.from({ length: 20 }, (_, i) => ({
      x: Math.cos((i * 2 * Math.PI) / 20) * 3,
      y: Math.sin((i * 2 * Math.PI) / 20) * 3,
    }));
    const body = createPolygon(pw, pts);
    expect(body).not.toBeNull();
    // Should have been simplified to ≤ 8 vertices (box2d3 limit)
    const shapeIds: b2ShapeId[] = body!.GetShapes() ?? [];
    expect(shapeIds.length).toBeGreaterThan(0);
    const poly = B2.b2Shape_GetPolygon(shapeIds[0]);
    expect(poly.count).toBeLessThanOrEqual(8);
  });

  it("positions body at centroid of hull", () => {
    const pw = makePw();
    const body = createPolygon(pw, [
      { x: 0, y: 0 },
      { x: 6, y: 0 },
      { x: 6, y: 6 },
      { x: 0, y: 6 },
    ]);
    expect(body).not.toBeNull();
    const pos = body!.GetPosition();
    expect(pos.x).toBeCloseTo(3);
    expect(pos.y).toBeCloseTo(3);
  });

  it("handles points with interior points (convex hull filters them)", () => {
    const pw = makePw();
    const body = createPolygon(pw, [
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
