import type * as planck from "planck";
import type { InputManager } from "../interaction/InputManager";
import type { Camera } from "./Camera";

export interface IParticleSystem {
  spawnWind(wx: number, wy: number, angle: number, range: number): void;
  spawnMuzzleFlash(wx: number, wy: number): void;
  spawnExplosion(wx: number, wy: number): void;
  spawnFlame(wx: number, wy: number, bodyAngle: number): void;
  spawnSpark(wx: number, wy: number): void;
}

export interface IRenderer {
  readonly particles: IParticleSystem;
  resize(): void;
  drawWorld(world: planck.World, camera: Camera): void;
  setInputManager(input: InputManager): void;
  /** Clean up resources (WebGL context, DOM elements, etc.) */
  dispose(): void;
}
