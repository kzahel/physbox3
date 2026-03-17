import type { Body, b2ChainId } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

/** Minimum distance between consecutive points (world units) */
const MIN_SEGMENT_LEN = 0.15;
/** Small margin below lowest point for the loop bottom */
const LOOP_MARGIN = 0.5;

/**
 * Douglas-Peucker polyline simplification.
 * Reduces point count while preserving shape within `epsilon` tolerance.
 */
function simplifyPolyline(pts: { x: number; y: number }[], epsilon: number): { x: number; y: number }[] {
  if (pts.length <= 2) return pts;

  const first = pts[0];
  const last = pts[pts.length - 1];
  const dx = last.x - first.x;
  const dy = last.y - first.y;
  const lenSq = dx * dx + dy * dy;

  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    let dist: number;
    if (lenSq === 0) {
      dist = Math.hypot(pts[i].x - first.x, pts[i].y - first.y);
    } else {
      const t = Math.max(0, Math.min(1, ((pts[i].x - first.x) * dx + (pts[i].y - first.y) * dy) / lenSq));
      const px = first.x + t * dx;
      const py = first.y + t * dy;
      dist = Math.hypot(pts[i].x - px, pts[i].y - py);
    }
    if (dist > maxDist) {
      maxDist = dist;
      maxIdx = i;
    }
  }

  if (maxDist > epsilon) {
    const left = simplifyPolyline(pts.slice(0, maxIdx + 1), epsilon);
    const right = simplifyPolyline(pts.slice(maxIdx), epsilon);
    return left.slice(0, -1).concat(right);
  }
  return [first, last];
}

/**
 * Create a terrain body from freeform drawn points.
 * Uses a closed-loop chain shape (surface + flat bottom) for solid collision.
 * Returns the body and chainId (for serialization/cleanup).
 */
export function createTerrain(
  pw: PhysWorld,
  rawPoints: { x: number; y: number }[],
): { body: Body; chainId: b2ChainId } | null {
  if (rawPoints.length < 2) return null;

  // Deduplicate very close points
  const deduped: { x: number; y: number }[] = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = deduped[deduped.length - 1];
    const d = Math.hypot(rawPoints[i].x - prev.x, rawPoints[i].y - prev.y);
    if (d >= MIN_SEGMENT_LEN) {
      deduped.push(rawPoints[i]);
    }
  }
  if (deduped.length < 2) return null;

  // Simplify to reduce segment count (epsilon scales with total length)
  const totalLen = deduped.reduce((sum, p, i) => {
    if (i === 0) return 0;
    return sum + Math.hypot(p.x - deduped[i - 1].x, p.y - deduped[i - 1].y);
  }, 0);
  const epsilon = Math.max(0.05, totalLen / 200);
  const simplified = simplifyPolyline(deduped, epsilon);
  if (simplified.length < 2) return null;

  const B2 = b2();

  // Compute bounding box of the surface points
  let minY = Infinity;
  for (const p of simplified) minY = Math.min(minY, p.y);

  // Build a closed-loop chain: surface points (right-to-left for upward-facing
  // normals), then close along the bottom at minY. A closed loop has no
  // endpoints, so there are no ghost vertex / endpoint collision issues.
  // Box2D v3 one-sided chains collide on the RIGHT of the edge direction
  // (Y-up), so the surface must go right-to-left for upward normals.
  if (simplified[simplified.length - 1].x > simplified[0].x) {
    simplified.reverse();
  }

  // Close the loop: from last surface point, drop to minY, across, back up
  const loopBottom = minY - LOOP_MARGIN;
  const firstPt = simplified[0];
  const lastPt = simplified[simplified.length - 1];
  const loopPoints = [...simplified, { x: lastPt.x, y: loopBottom }, { x: firstPt.x, y: loopBottom }];

  // Create a static body at origin
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(0, 0);
  const body = pw.createBody(bodyDef);

  // Create closed-loop chain shape
  const chainDef = B2.b2DefaultChainDef();
  chainDef.SetPoints(loopPoints);
  chainDef.isLoop = true;
  const surfaceMat = B2.b2DefaultSurfaceMaterial();
  surfaceMat.friction = 0.6;
  surfaceMat.restitution = 0.1;
  chainDef.SetMaterials([surfaceMat]);
  const chain = body.CreateChain(chainDef)!;
  const chainId: b2ChainId = chain.GetPointer() as unknown as b2ChainId;

  // Store terrain points in userData for rendering/serialization
  pw.setUserData(body, {
    fill: "rgba(80,100,60,0.9)",
    label: "terrain",
    terrainPoints: simplified.map((p) => ({ x: p.x, y: p.y })),
  });

  return { body, chainId };
}
