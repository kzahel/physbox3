import type { ToolRenderInfo } from "../interaction/ToolHandler";
import type { Camera } from "./Camera";
import type { Interpolation } from "./Interpolation";
import type { PhysWorld } from "./PhysWorld";
import type { WasmParticleSystem } from "./WasmParticleSystem";

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
  drawWorld(pw: PhysWorld, camera: Camera, interp?: Interpolation, wasmParticles?: WasmParticleSystem | null): void;
  setInputManager(input: ToolRenderInfo): void;
  /** Clean up resources (WebGL context, DOM elements, etc.) */
  dispose(): void;
}
