import type { Body, b2ChainId } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

/** Minimum distance between consecutive points (world units) */
const MIN_SEGMENT_LEN = 0.15;
/** Backstop extends this far below the lowest terrain point */
const BACKSTOP_DEPTH = 50;

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
 * Uses a chain shape for the surface + a large backstop box underneath.
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

  // Box2D v3 chain shapes are one-sided: the solid side is to the RIGHT of
  // the edge direction (in Y-up coords). For terrain where objects should rest
  // ON TOP, we need the chain to go from right-to-left so the right-hand
  // normal points upward. Ensure consistent winding by checking x-direction.
  if (simplified[simplified.length - 1].x > simplified[0].x) {
    simplified.reverse();
  }

  // Extend endpoints with ghost points to prevent fall-through at the ends.
  // Each ghost extends the first/last segment direction by a short distance.
  const ghostLen = 2;
  const first = simplified[0];
  const second = simplified[1];
  const dxF = first.x - second.x;
  const dyF = first.y - second.y;
  const lenF = Math.hypot(dxF, dyF) || 1;
  simplified.unshift({ x: first.x + (dxF / lenF) * ghostLen, y: first.y + (dyF / lenF) * ghostLen });

  const last = simplified[simplified.length - 1];
  const prev = simplified[simplified.length - 2];
  const dxL = last.x - prev.x;
  const dyL = last.y - prev.y;
  const lenL = Math.hypot(dxL, dyL) || 1;
  simplified.push({ x: last.x + (dxL / lenL) * ghostLen, y: last.y + (dyL / lenL) * ghostLen });

  // Compute bounding box of the terrain surface
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  for (const p of simplified) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
  }

  // Create a static body at origin (chain points are in world space relative to body)
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(0, 0);
  const body = pw.createBody(bodyDef);

  // Create chain shape for the surface
  const chainDef = B2.b2DefaultChainDef();
  chainDef.SetPoints(simplified);
  chainDef.isLoop = false;
  const surfaceMat = B2.b2DefaultSurfaceMaterial();
  surfaceMat.friction = 0.6;
  surfaceMat.restitution = 0.1;
  chainDef.SetMaterials([surfaceMat]);
  const chain = body.CreateChain(chainDef)!;
  const chainId: b2ChainId = chain.GetPointer() as unknown as b2ChainId;

  // Create backstop box underneath the terrain surface
  const halfW = (maxX - minX) / 2 + 1;
  const halfH = BACKSTOP_DEPTH / 2;
  const centerX = (minX + maxX) / 2;
  const centerY = minY - halfH;

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.material.friction = 0.6;
  shapeDef.material.restitution = 0.1;

  const backstopBox = B2.b2MakeOffsetBox(halfW, halfH, new B2.b2Vec2(centerX, centerY), B2.b2Rot_identity);
  body.CreatePolygonShape(shapeDef, backstopBox);

  // Store terrain points in userData for rendering/serialization
  pw.setUserData(body, {
    fill: "rgba(80,100,60,0.9)",
    label: "terrain",
    terrainPoints: simplified.map((p) => ({ x: p.x, y: p.y })),
  });

  return { body, chainId };
}
