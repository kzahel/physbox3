import * as THREE from "three";

export const EXTRUDE_DEPTH = 0.6;

/**
 * Inset a convex polygon by `amount` using proper per-edge offset.
 */
export function insetConvexPolygon(verts: { x: number; y: number }[], amount: number): { x: number; y: number }[] {
  const n = verts.length;
  let cx = 0,
    cy = 0;
  for (const v of verts) {
    cx += v.x;
    cy += v.y;
  }
  cx /= n;
  cy /= n;

  const edgeNormals: { nx: number; ny: number }[] = [];
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    const dx = b.x - a.x,
      dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len,
      ny = dx / len;
    const midX = (a.x + b.x) / 2,
      midY = (a.y + b.y) / 2;
    if (nx * (cx - midX) + ny * (cy - midY) < 0) {
      nx = -nx;
      ny = -ny;
    }
    edgeNormals.push({ nx, ny });
  }

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prevEdge = (i - 1 + n) % n;

    const a0 = verts[prevEdge];
    const a1 = verts[i];
    const nA = edgeNormals[prevEdge];
    const pAx = a0.x + nA.nx * amount,
      pAy = a0.y + nA.ny * amount;
    const dAx = a1.x - a0.x,
      dAy = a1.y - a0.y;

    const b0 = verts[i];
    const b1 = verts[(i + 1) % n];
    const nB = edgeNormals[i];
    const pBx = b0.x + nB.nx * amount,
      pBy = b0.y + nB.ny * amount;
    const dBx = b1.x - b0.x,
      dBy = b1.y - b0.y;

    const cross = dAx * dBy - dAy * dBx;
    if (Math.abs(cross) < 1e-10) {
      result.push({ x: a1.x + nA.nx * amount, y: a1.y + nA.ny * amount });
    } else {
      const t = ((pBx - pAx) * dBy - (pBy - pAy) * dBx) / cross;
      result.push({ x: pAx + t * dAx, y: pAy + t * dAy });
    }
  }
  return result;
}

export function createPolygonGeometry(verts: { x: number; y: number }[]): THREE.ExtrudeGeometry {
  const n = verts.length;
  let minEdge = Infinity;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    minEdge = Math.min(minEdge, Math.hypot(b.x - a.x, b.y - a.y));
  }
  const bevel = Math.min(minEdge * 0.12, EXTRUDE_DEPTH * 0.3, 0.08);

  const inset = insetConvexPolygon(verts, bevel);

  const shape = new THREE.Shape();
  shape.moveTo(inset[0].x, inset[0].y);
  for (let i = 1; i < inset.length; i++) {
    shape.lineTo(inset[i].x, inset[i].y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 1,
  });
}
