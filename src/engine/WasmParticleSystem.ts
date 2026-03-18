import type { ParticleSystem, ParticleSystemDef, World, b2Vec2 } from "box2d3";
import { b2 } from "./Box2D";

const DEFAULT_PARTICLE_RADIUS = 0.09;
const DEFAULT_SPAWN_RADIUS = 0.7;
const DEFAULT_SPAWN_SPACING = 0.16;
const DEFAULT_MAX_PARTICLES = 4000;

export class WasmParticleSystem {
  private system: ParticleSystem | null;
  private readonly particleRadius: number;

  constructor(world: World) {
    const B2 = b2();
    const def: ParticleSystemDef = new B2.ParticleSystemDef();
    def.radius = DEFAULT_PARTICLE_RADIUS;
    def.density = 1.0;
    def.gravityScale = 1.0;
    def.initialCapacity = 512;
    def.maxParticles = DEFAULT_MAX_PARTICLES;

    this.system = B2.createParticleSystem(world, def);
    if (!this.system) {
      throw new Error("Failed to create particle system");
    }

    this.particleRadius = def.radius;
  }

  destroy() {
    if (!this.system) return;
    b2().destroyParticleSystem(this.system);
    this.system = null;
  }

  isValid(): boolean {
    return this.system?.IsValid() ?? false;
  }

  getCount(): number {
    return this.system?.GetParticleCount() ?? 0;
  }

  getParticleRadius(): number {
    return this.particleRadius;
  }

  getPositionBuffer(): Float32Array {
    return (this.system?.GetPositionBuffer() as Float32Array | undefined) ?? new Float32Array(0);
  }

  step(timeStep: number) {
    this.system?.Step(timeStep);
  }

  clear() {
    this.system?.Clear();
  }

  spawnCircle(center: { x: number; y: number }, radius = DEFAULT_SPAWN_RADIUS, spacing = DEFAULT_SPAWN_SPACING): number {
    if (!this.system) return 0;
    const B2 = b2();
    return this.system.SpawnParticlesInCircle(
      new B2.b2Vec2(center.x, center.y),
      radius,
      spacing,
      new B2.b2Vec2(0, 0),
    );
  }

  spawnBurstAtPoint(center: { x: number; y: number }): number {
    return this.spawnCircle(center);
  }

  spawnBurstAtVec2(center: b2Vec2): number {
    return this.spawnCircle(center);
  }
}
