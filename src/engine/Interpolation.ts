import type { Body, b2Vec2 } from "box2d3";
import { b2 } from "./Box2D";
import type { PhysWorld } from "./PhysWorld";

/** Snapshot of a body's transform at a previous physics step. */
export interface BodySnapshot {
  x: number;
  y: number;
  angle: number;
}

/** Interpolation state passed to renderers each frame. */
export interface Interpolation {
  /** Blend factor: 0 = previous physics state, 1 = current physics state. */
  alpha: number;
  /** Previous-step transforms keyed by body. Missing entries = no interpolation (use current). */
  prev: WeakMap<Body, BodySnapshot>;
}

/** Default interpolation (alpha=1, no blending — equivalent to pre-interpolation behavior). */
export const NO_INTERP: Interpolation = { alpha: 1, prev: new WeakMap() };

/** Return the interpolated position and angle for a body. */
export function lerpBody(body: Body, interp: Interpolation): { x: number; y: number; angle: number } {
  const B2 = b2();
  const cur = body.GetPosition();
  const curAngle = B2.b2Rot_GetAngle(body.GetRotation());
  const prev = interp.prev.get(body);
  if (!prev || interp.alpha >= 1) {
    return { x: cur.x, y: cur.y, angle: curAngle };
  }
  const a = interp.alpha;
  // Shortest-arc interpolation: normalize angle delta to [-π, π]
  let da = curAngle - prev.angle;
  da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
  return {
    x: prev.x + (cur.x - prev.x) * a,
    y: prev.y + (cur.y - prev.y) * a,
    angle: prev.angle + da * a,
  };
}

/**
 * Interpolated equivalent of body.GetWorldPoint(localPoint).
 * Converts a current world-space point to local, then back to world using interpolated transform.
 */
export function lerpWorldPoint(body: Body, worldPoint: b2Vec2, interp: Interpolation): { x: number; y: number } {
  const prev = interp.prev.get(body);
  if (!prev || interp.alpha >= 1) {
    return { x: worldPoint.x, y: worldPoint.y };
  }
  // Convert world point to local space using current body transform
  const localP = body.GetLocalPoint(worldPoint);
  // Re-project using interpolated transform
  const s = lerpBody(body, interp);
  const cos = Math.cos(s.angle);
  const sin = Math.sin(s.angle);
  return {
    x: s.x + cos * localP.x - sin * localP.y,
    y: s.y + sin * localP.x + cos * localP.y,
  };
}

/** Snapshot all body transforms into the WeakMap. Call before physics stepping. */
export function snapshotBodies(pw: PhysWorld, prev: WeakMap<Body, BodySnapshot>): void {
  const B2 = b2();
  pw.forEachBody((body) => {
    const pos = body.GetPosition();
    prev.set(body, { x: pos.x, y: pos.y, angle: B2.b2Rot_GetAngle(body.GetRotation()) });
  });
}
