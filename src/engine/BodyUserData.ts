/**
 * Centralized type for body userData across the codebase.
 * In box2d3-wasm, userData is stored externally via PhysWorld.setUserData/getUserData.
 * Uses a discriminated union on `label` for type-safe access per prefab type.
 */

import type { Body } from "box2d3";
import type { PhysWorld } from "./PhysWorld";

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
  parentCannon?: Body;
}

export interface ConveyorData extends BodyDataBase {
  label: "conveyor";
  speed: number;
}

export interface JellyData extends BodyDataBase {
  label: "jelly";
  jellyPerimeter?: Body[];
}

export interface SandData extends BodyDataBase {
  label: "sand";
}

export interface TerrainData extends BodyDataBase {
  label: "terrain";
  terrainPoints: { x: number; y: number }[];
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
  | JellyData
  | SandData
  | TerrainData
  | GenericBodyData;

/** Type-safe accessor for body userData via PhysWorld */
export function getBodyUserData(pw: PhysWorld, body: Body): BodyUserData | null {
  return pw.getUserData(body);
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

export function isJelly(ud: BodyUserData | null): ud is JellyData {
  return ud?.label === "jelly";
}

export function isSand(ud: BodyUserData | null): ud is SandData {
  return ud?.label === "sand";
}

export function isTerrain(ud: BodyUserData | null): ud is TerrainData {
  return ud?.label === "terrain";
}

/** Fixture-level style data */
export interface FixtureStyle {
  fill?: string;
  stroke?: string;
}
