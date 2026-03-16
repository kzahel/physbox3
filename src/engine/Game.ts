import * as planck from "planck";
import type { InputManager } from "../interaction/InputManager";
import { Camera } from "./Camera";
import { Renderer } from "./Renderer";

export const KILL_Y = -100;
const TIMESTEP = 1 / 60;
const VELOCITY_ITERS = 8;
const POSITION_ITERS = 3;

export class Game {
  world: planck.World;
  camera: Camera;
  renderer: Renderer;
  canvas: HTMLCanvasElement;

  gravity = -10;
  timeScale = 1;
  inputManager: InputManager | null = null;
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

    this.buildDefaultScene();
  }

  private buildDefaultScene() {
    // Ground
    const ground = this.world.createBody({ type: "static", position: planck.Vec2(0, -1) });
    ground.createFixture({ shape: planck.Box(40, 1) });
    ground.setUserData({ fill: "rgba(60,70,90,0.9)", label: "ground" });

    // Left wall
    const leftWall = this.world.createBody({ type: "static", position: planck.Vec2(-40, 10) });
    leftWall.createFixture({ shape: planck.Box(1, 12) });
    leftWall.setUserData({ fill: "rgba(60,70,90,0.9)", label: "wall" });

    // Right wall
    const rightWall = this.world.createBody({ type: "static", position: planck.Vec2(40, 10) });
    rightWall.createFixture({ shape: planck.Box(1, 12) });
    rightWall.setUserData({ fill: "rgba(60,70,90,0.9)", label: "wall" });

    // A few starter objects
    this.addBox(0, 5);
    this.addBall(-3, 8, 0.5);
    this.addBall(2, 10, 0.3);
  }

  addBox(x: number, y: number, w = 1, h = 1) {
    const body = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    body.createFixture({ shape: planck.Box(w / 2, h / 2), density: 1, friction: 0.4, restitution: 0.2 });
    body.setUserData({ fill: "rgba(200,120,255,0.7)" });
    return body;
  }

  addBall(x: number, y: number, radius = 0.5) {
    const body = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    body.createFixture({ shape: planck.Circle(radius), density: 1, friction: 0.3, restitution: 0.6 });
    body.setUserData({ fill: "rgba(100,200,255,0.7)" });
    return body;
  }

  addPlatform(x: number, y: number, w: number, angle = 0) {
    const body = this.world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
    body.createFixture({ shape: planck.Box(w / 2, 0.15), friction: 0.5 });
    body.setUserData({ fill: "rgba(80,100,80,0.8)", label: "platform" });
    return body;
  }

  addChainRope(x: number, y: number, links: number, linkLen = 0.4) {
    const anchor = this.world.createBody({ type: "static", position: planck.Vec2(x, y) });
    anchor.createFixture({ shape: planck.Circle(0.15) });

    let prev: planck.Body = anchor;
    for (let i = 0; i < links; i++) {
      const link = this.world.createBody({
        type: "dynamic",
        position: planck.Vec2(x, y - (i + 1) * linkLen),
      });
      link.createFixture({ shape: planck.Box(0.08, linkLen / 2), density: 2, friction: 0.4 });
      link.setUserData({ fill: "rgba(180,160,120,0.7)" });

      this.world.createJoint(planck.RevoluteJoint({}, prev, link, planck.Vec2(x, y - i * linkLen - linkLen / 2)));
      prev = link;
    }
    return prev; // return last link for attaching things
  }

  addCar(x: number, y: number) {
    // Chassis
    const chassis = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    chassis.createFixture({ shape: planck.Box(2, 0.5), density: 1, friction: 0.3 });
    chassis.setUserData({ fill: "rgba(220,80,60,0.8)" });

    // Roof
    chassis.createFixture({
      shape: planck.Polygon([
        planck.Vec2(-1.2, 0.5),
        planck.Vec2(-0.6, 1.1),
        planck.Vec2(1.0, 1.1),
        planck.Vec2(1.4, 0.5),
      ]),
      density: 0.5,
    });

    const wheelRadius = 0.5;
    const suspAxis = planck.Vec2(0, 1);
    const wheelOpts = {
      enableMotor: true,
      motorSpeed: -10,
      maxMotorTorque: 50,
      frequencyHz: 4,
      dampingRatio: 0.7,
    };

    // Rear wheel
    const rearWheel = this.world.createBody({ type: "dynamic", position: planck.Vec2(x - 1.2, y - 0.7) });
    rearWheel.createFixture({ shape: planck.Circle(wheelRadius), density: 1, friction: 0.9 });
    rearWheel.setUserData({ fill: "rgba(50,50,50,0.9)" });
    this.world.createJoint(planck.WheelJoint(wheelOpts, chassis, rearWheel, rearWheel.getPosition(), suspAxis));

    // Front wheel
    const frontWheel = this.world.createBody({ type: "dynamic", position: planck.Vec2(x + 1.2, y - 0.7) });
    frontWheel.createFixture({ shape: planck.Circle(wheelRadius), density: 1, friction: 0.9 });
    frontWheel.setUserData({ fill: "rgba(50,50,50,0.9)" });
    this.world.createJoint(planck.WheelJoint(wheelOpts, chassis, frontWheel, frontWheel.getPosition(), suspAxis));

    return chassis;
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
    // Re-create the ground body used by InputManager
    if (this.inputManager) {
      this.inputManager.resetGroundBody();
    }
    this.buildDefaultScene();
  }

  clearDynamic() {
    const toRemove: planck.Body[] = [];
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (b.isDynamic()) toRemove.push(b);
    }
    for (const b of toRemove) this.world.destroyBody(b);
  }

  destroyBodyAt(wx: number, wy: number, radius = 0.5): boolean {
    const point = planck.Vec2(wx, wy);
    let found: planck.Body | null = null;

    this.world.queryAABB(
      planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
      (fixture) => {
        if (fixture.testPoint(point) && fixture.getBody().isDynamic()) {
          found = fixture.getBody();
          return false; // stop query
        }
        return true;
      },
    );

    if (found) {
      this.world.destroyBody(found);
      return true;
    }
    return false;
  }

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
      this.accumulator += dt * this.timeScale;
      while (this.accumulator >= TIMESTEP) {
        this.world.step(TIMESTEP, VELOCITY_ITERS, POSITION_ITERS);
        this.accumulator -= TIMESTEP;
      }
    }

    // Kill floor: destroy dynamic bodies that fall too far
    const killY = KILL_Y;
    const toRemove: planck.Body[] = [];
    let count = 0;
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (b.isDynamic()) {
        if (b.getPosition().y < killY) {
          toRemove.push(b);
        } else {
          count++;
        }
      }
    }
    for (const b of toRemove) this.world.destroyBody(b);
    this.bodyCount = count;

    // Render
    this.renderer.drawWorld(this.world, this.camera);
  }
}
