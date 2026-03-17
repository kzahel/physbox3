/**
 * Centralized type for body.getUserData() across the codebase.
 * Uses a discriminated union on `label` for type-safe access per prefab type.
 */

/** Shared fields present on all body user data. */
interface BodyDataBase {
  fill?: string;
  stroke?: string;
  destroyed?: boolean;
  motorSpeed?: number;
}

export interface RocketData extends BodyDataBase {
  label: "rocket";
  thrust: number;
  fuel: number;
}

export interface FanData extends BodyDataBase {
  label: "fan";
  force: number;
  range: number;
}

export interface BalloonData extends BodyDataBase {
  label: "balloon";
  lift: number;
}

export interface DynamiteData extends BodyDataBase {
  label: "dynamite";
  fuseRemaining: number;
  fuseDuration: number;
}

export interface CannonData extends BodyDataBase {
  label: "cannon";
  cannonCooldown: number;
}

export interface CannonballData extends BodyDataBase {
  label: "cannonball";
  lifetime: number;
  exploded?: boolean;
  parentCannon?: import("planck").Body;
}

export interface ConveyorData extends BodyDataBase {
  label: "conveyor";
  speed: number;
}

/** Bodies with a generic or no label (ground, wall, rope links, etc.) */
export interface GenericBodyData extends BodyDataBase {
  label?: string;
}

export type BodyUserData =
  | RocketData
  | FanData
  | BalloonData
  | DynamiteData
  | CannonData
  | CannonballData
  | ConveyorData
  | GenericBodyData;

/** Type-safe accessor for body userData */
export function getBodyUserData(body: import("planck").Body): BodyUserData | null {
  return body.getUserData() as BodyUserData | null;
}

// ── Type guards for narrowing after getBodyUserData() ──

export function isRocket(ud: BodyUserData | null): ud is RocketData {
  return ud?.label === "rocket";
}

export function isFan(ud: BodyUserData | null): ud is FanData {
  return ud?.label === "fan";
}

export function isBalloon(ud: BodyUserData | null): ud is BalloonData {
  return ud?.label === "balloon";
}

export function isDynamite(ud: BodyUserData | null): ud is DynamiteData {
  return ud?.label === "dynamite";
}

export function isCannon(ud: BodyUserData | null): ud is CannonData {
  return ud?.label === "cannon";
}

export function isCannonball(ud: BodyUserData | null): ud is CannonballData {
  return ud?.label === "cannonball";
}

export function isConveyor(ud: BodyUserData | null): ud is ConveyorData {
  return ud?.label === "conveyor";
}

/** Fixture-level style data */
export interface FixtureStyle {
  fill?: string;
  stroke?: string;
}
