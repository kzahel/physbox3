import * as planck from "planck";
import type { InputManager } from "../interaction/InputManager";
import { createBall } from "../prefabs/Ball";
import { applyBalloonLift, createBalloon } from "../prefabs/Balloon";
import { createBox } from "../prefabs/Box";
import { createCannon } from "../prefabs/Cannon";
import { createCar } from "../prefabs/Car";
import { createConveyor } from "../prefabs/Conveyor";
import { createDynamite } from "../prefabs/Dynamite";
import { applyFanForce, createFan } from "../prefabs/Fan";
import { createLauncher } from "../prefabs/Launcher";
import { createPlatform } from "../prefabs/Platform";
import { createRagdoll, type RagdollData } from "../prefabs/Ragdoll";
import { applyRocketThrust, createRocket } from "../prefabs/Rocket";
import { createChainRope, createRopeBetween } from "../prefabs/Rope";
import { createSeesaw } from "../prefabs/Seesaw";
import { createSpringBall } from "../prefabs/SpringBall";
import { playBounce, playWoodHit, unlockAudio } from "./Audio";
import { Camera } from "./Camera";
import { clearDynamic, destroyBodyAt, explodeAt, scaleBody } from "./Physics";
import { Renderer } from "./Renderer";

export const KILL_Y = -100;
export const KILL_Y_TOP = 200;
const TIMESTEP = 1 / 60;

function applyMotorTorque(world: planck.World) {
  for (let b = world.getBodyList(); b; b = b.getNext()) {
    const ud = b.getUserData() as { motorSpeed?: number } | null;
    if (ud?.motorSpeed == null) continue;
    b.setAngularVelocity(ud.motorSpeed);
  }
}

export class Game {
  world: planck.World;
  camera: Camera;
  renderer: Renderer;
  canvas: HTMLCanvasElement;

  gravity = -10;
  bounciness = 0.5;
  timeScale = 1;
  velocityIterations = 8;
  positionIterations = 3;
  inputManager: InputManager | null = null;
  ragdolls: RagdollData[] = [];
  followSelected = false;
  followBody: planck.Body | null = null;
  onPauseChange?: () => void;

  private _paused = false;
  get paused() {
    return this._paused;
  }
  set paused(v: boolean) {
    this._paused = v;
    this.onPauseChange?.();
  }

  // Stats
  fps = 0;
  bodyCount = 0;

  private lastTime = 0;
  private accumulator = 0;
  private frameCount = 0;
  private fpsTimer = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.world = new planck.World({ gravity: planck.Vec2(0, this.gravity) });
    this.camera = new Camera();
    this.renderer = new Renderer(canvas);

    this.renderer.resize();
    window.addEventListener("resize", () => this.renderer.resize());
    unlockAudio();

    this.buildDefaultScene();
    this.bindCollisionSounds();
    this.bindBounciness();
  }

  private bindBounciness() {
    this.world.on("pre-solve", (contact) => {
      contact.setRestitution(this.bounciness);
    });
  }

  private bindCollisionSounds() {
    const MIN_IMPULSE = 2;
    const MAX_IMPULSE = 15;

    this.world.on("post-solve", (contact, impulse) => {
      const ni = impulse.normalImpulses[0];
      if (ni < MIN_IMPULSE) return;

      const fA = contact.getFixtureA();
      const fB = contact.getFixtureB();
      const tA = fA.getShape().getType();
      const tB = fB.getShape().getType();
      const intensity = Math.min(1, (ni - MIN_IMPULSE) / (MAX_IMPULSE - MIN_IMPULSE));

      if (tA === "circle" || tB === "circle") {
        playBounce(intensity);
      } else if (tA === "polygon" || tB === "polygon") {
        playWoodHit(intensity);
      }
    });
  }

  private buildDefaultScene() {
    const ground = this.world.createBody({ type: "static", position: planck.Vec2(0, -1) });
    ground.createFixture({ shape: planck.Box(40, 1) });
    ground.setUserData({ fill: "rgba(60,70,90,0.9)", label: "ground" });

    const leftWall = this.world.createBody({ type: "static", position: planck.Vec2(-40, 10) });
    leftWall.createFixture({ shape: planck.Box(1, 12) });
    leftWall.setUserData({ fill: "rgba(60,70,90,0.9)", label: "wall" });

    const rightWall = this.world.createBody({ type: "static", position: planck.Vec2(40, 10) });
    rightWall.createFixture({ shape: planck.Box(1, 12) });
    rightWall.setUserData({ fill: "rgba(60,70,90,0.9)", label: "wall" });

    this.addBox(0, 5);
    this.addBall(-3, 8, 0.5);
    this.addBall(2, 10, 0.3);
  }

  // --- Prefab delegates (preserve external API) ---

  addBox(x: number, y: number, w = 1, h = 1) {
    return createBox(this.world, x, y, w, h);
  }

  addBall(x: number, y: number, radius = 0.5) {
    return createBall(this.world, x, y, radius);
  }

  addPlatform(x: number, y: number, w: number, angle = 0) {
    return createPlatform(this.world, x, y, w, angle);
  }

  addChainRope(x: number, y: number, links: number, linkLen = 0.4) {
    return createChainRope(this.world, x, y, links, linkLen);
  }

  addRopeBetween(x1: number, y1: number, x2: number, y2: number, bodyA: planck.Body | null, bodyB: planck.Body | null) {
    return createRopeBetween(this.world, x1, y1, x2, y2, bodyA, bodyB);
  }

  addSpringBall(x: number, y: number) {
    return createSpringBall(this.world, x, y);
  }

  addLauncher(x: number, y: number) {
    return createLauncher(this.world, x, y);
  }

  addCar(x: number, y: number) {
    return createCar(this.world, x, y);
  }

  addSeesaw(x: number, y: number) {
    return createSeesaw(this.world, x, y);
  }

  addRocket(x: number, y: number, angle = 0) {
    return createRocket(this.world, x, y, angle);
  }

  addBalloon(x: number, y: number) {
    return createBalloon(this.world, x, y);
  }

  addRagdoll(x: number, y: number) {
    return createRagdoll(this.world, x, y, this.ragdolls);
  }

  addCannon(x: number, y: number, angle: number) {
    return createCannon(this.world, this.renderer, (wx, wy, r, f) => this.explodeAt(wx, wy, r, f), x, y, angle);
  }

  addFan(x: number, y: number, angle: number, force = 15, range = 10) {
    return createFan(this.world, x, y, angle, force, range);
  }

  addConveyor(x: number, y: number, w = 6, speed = 3, angle = 0) {
    return createConveyor(this.world, x, y, w, speed, angle);
  }

  addDynamite(x: number, y: number, fuseTime = 3) {
    return createDynamite(this.world, (wx, wy, r, f) => this.explodeAt(wx, wy, r, f), x, y, fuseTime);
  }

  // --- Physics utilities ---

  explodeAt(wx: number, wy: number, radius: number, force: number) {
    explodeAt(this.world, this.renderer, wx, wy, radius, force);
  }

  scaleBody(body: planck.Body, scale: number): planck.Body {
    return scaleBody(this.world, body, scale);
  }

  clearDynamic() {
    clearDynamic(this.world);
  }

  destroyBodyAt(wx: number, wy: number, radius = 0.5): boolean {
    return destroyBodyAt(this.world, wx, wy, radius);
  }

  // --- Settings ---

  setBounciness(value: number) {
    this.bounciness = value;
  }

  setGravity(g: number) {
    this.gravity = g;
    this.world.setGravity(planck.Vec2(0, g));
  }

  setGravityXY(gx: number, gy: number) {
    this.gravity = gy;
    this.world.setGravity(planck.Vec2(gx, gy));
  }

  reset() {
    const allBodies: planck.Body[] = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      allBodies.push(b);
    }
    for (const b of allBodies) this.world.destroyBody(b);
    this.ragdolls.length = 0;
    if (this.inputManager) {
      this.inputManager.resetGroundBody();
    }
    this.buildDefaultScene();
  }

  // --- Game loop ---

  start() {
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  private loop(time: number) {
    requestAnimationFrame((t) => this.loop(t));

    const dt = Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;

    // FPS counter
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }

    // Physics step
    if (!this.paused) {
      this.inputManager?.update();
      applyRocketThrust(this.world, this.renderer, dt * this.timeScale);
      applyBalloonLift(this.world);
      applyFanForce(this.world, this.renderer);
      applyMotorTorque(this.world);
      this.accumulator += dt * this.timeScale;
      while (this.accumulator >= TIMESTEP) {
        this.world.step(TIMESTEP, this.velocityIterations, this.positionIterations);
        this.accumulator -= TIMESTEP;
      }
    }

    // Kill floor
    const killY = KILL_Y;
    const toRemove: planck.Body[] = [];
    let count = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (b.isDynamic()) {
        if (b.getPosition().y < killY || b.getPosition().y > KILL_Y_TOP) {
          toRemove.push(b);
        } else {
          count++;
        }
      }
    }
    for (const b of toRemove) this.world.destroyBody(b);
    this.bodyCount = count;

    // Camera follow — update followBody when selection changes
    const sel = this.inputManager?.selectedBody ?? null;
    if (sel && sel !== this.followBody) this.followBody = sel;
    if (this.followSelected && this.followBody?.isActive()) {
      const pos = this.followBody.getPosition();
      this.camera.x = pos.x;
      this.camera.y = pos.y;
    }

    // Render
    this.renderer.drawWorld(this.world, this.camera);
  }
}
