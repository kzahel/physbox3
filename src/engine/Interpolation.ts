import type * as planck from "planck";
import { forEachBody } from "./Physics";

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
  prev: WeakMap<planck.Body, BodySnapshot>;
}

/** Default interpolation (alpha=1, no blending — equivalent to pre-interpolation behavior). */
export const NO_INTERP: Interpolation = { alpha: 1, prev: new WeakMap() };

/** Return the interpolated position and angle for a body. */
export function lerpBody(body: planck.Body, interp: Interpolation): { x: number; y: number; angle: number } {
  const cur = body.getPosition();
  const curAngle = body.getAngle();
  const prev = interp.prev.get(body);
  if (!prev || interp.alpha >= 1) {
    return { x: cur.x, y: cur.y, angle: curAngle };
  }
  const a = interp.alpha;
  return {
    x: prev.x + (cur.x - prev.x) * a,
    y: prev.y + (cur.y - prev.y) * a,
    angle: prev.angle + (curAngle - prev.angle) * a,
  };
}

/**
 * Interpolated equivalent of body.getWorldPoint(localPoint).
 * Converts a current world-space point to local, then back to world using interpolated transform.
 */
export function lerpWorldPoint(
  body: planck.Body,
  worldPoint: planck.Vec2Value,
  interp: Interpolation,
): { x: number; y: number } {
  const prev = interp.prev.get(body);
  if (!prev || interp.alpha >= 1) {
    return { x: worldPoint.x, y: worldPoint.y };
  }
  // Convert world point to local space using current body transform
  const localP = body.getLocalPoint(worldPoint);
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
export function snapshotBodies(world: planck.World, prev: WeakMap<planck.Body, BodySnapshot>): void {
  forEachBody(world, (body) => {
    const pos = body.getPosition();
    prev.set(body, { x: pos.x, y: pos.y, angle: body.getAngle() });
  });
}
