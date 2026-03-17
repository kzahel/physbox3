import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import { convexHull } from "../engine/ConvexHull";
import type { PhysWorld } from "../engine/PhysWorld";

/** Maximum vertices box2d3 allows per polygon */
const MAX_VERTS = 8;

/** Minimum area (world units²) to create a polygon */
const MIN_AREA = 0.05;

/**
 * Simplify a convex hull to at most `maxVerts` vertices by iteratively
 * removing the vertex whose removal loses the least area.
 */
function simplifyHull(hull: { x: number; y: number }[], maxVerts: number): { x: number; y: number }[] {
  while (hull.length > maxVerts) {
    let minArea = Infinity;
    let minIdx = 0;
    for (let i = 0; i < hull.length; i++) {
      const prev = hull[(i - 1 + hull.length) % hull.length];
      const cur = hull[i];
      const next = hull[(i + 1) % hull.length];
      // Triangle area formed by removing cur
      const area = Math.abs((next.x - prev.x) * (cur.y - prev.y) - (cur.x - prev.x) * (next.y - prev.y)) / 2;
      if (area < minArea) {
        minArea = area;
        minIdx = i;
      }
    }
    hull.splice(minIdx, 1);
  }
  return hull;
}

/** Polygon area (shoelace formula) */
function polyArea(verts: { x: number; y: number }[]): number {
  let area = 0;
  for (let i = 0; i < verts.length; i++) {
    const j = (i + 1) % verts.length;
    area += verts[i].x * verts[j].y;
    area -= verts[j].x * verts[i].y;
  }
  return Math.abs(area) / 2;
}

export function createPolygon(pw: PhysWorld, points: { x: number; y: number }[]): Body | null {
  if (points.length < 3) return null;

  let hull = convexHull(points);
  if (hull.length < 3) return null;

  hull = simplifyHull(hull, MAX_VERTS);
  if (hull.length < 3) return null;

  const area = polyArea(hull);
  if (area < MIN_AREA) return null;

  // Compute centroid
  let cx = 0;
  let cy = 0;
  for (const v of hull) {
    cx += v.x;
    cy += v.y;
  }
  cx /= hull.length;
  cy /= hull.length;

  // Create vertices relative to centroid
  const B2 = b2();
  const localVerts = hull.map((v) => new B2.b2Vec2(v.x - cx, v.y - cy));

  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_dynamicBody;
  bodyDef.position = new B2.b2Vec2(cx, cy);
  const body = pw.createBody(bodyDef);

  const hullResult = B2.b2ComputeHull(localVerts);
  const poly = B2.b2MakePolygon(hullResult, 0);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 1;
  shapeDef.material.friction = 0.4;
  shapeDef.material.restitution = 0.2;
  shapeDef.enableHitEvents = true;

  body.CreatePolygonShape(shapeDef, poly);

  pw.setUserData(body, { fill: "rgba(120,200,160,0.7)", label: "polygon" });
  return body;
}
