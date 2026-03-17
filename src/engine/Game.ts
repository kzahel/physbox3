import type { Body } from "box2d3";
import type { InputManager } from "../interaction/InputManager";
import { createBall } from "../prefabs/Ball";
import { applyBalloonLift, createBalloon } from "../prefabs/Balloon";
import { createBox } from "../prefabs/Box";
import { createCannon, tickCannons } from "../prefabs/Cannon";
import { createCar } from "../prefabs/Car";
import { createConveyor } from "../prefabs/Conveyor";
import { createDynamite, tickDynamite } from "../prefabs/Dynamite";
import { applyFanForce, createFan, spawnFanParticles } from "../prefabs/Fan";
import { createLauncher } from "../prefabs/Launcher";
import { createPlatform } from "../prefabs/Platform";
import { createRagdoll, updateRagdollFootContacts, type RagdollData } from "../prefabs/Ragdoll";
import { applyRocketThrust, createRocket, spawnRocketParticles } from "../prefabs/Rocket";
import { applyRopeStabilization, createChainRope, createRopeBetween } from "../prefabs/Rope";
import { createSeesaw } from "../prefabs/Seesaw";
import { createSpringBall } from "../prefabs/SpringBall";
import { createTrain } from "../prefabs/Train";
import { playBounce, playWoodHit, unlockAudio } from "./Audio";
import { getBodyUserData } from "./BodyUserData";
import { b2 } from "./Box2D";
import { Camera } from "./Camera";
import type { Interpolation } from "./Interpolation";
import { snapshotBodies } from "./Interpolation";
import type { IRenderer } from "./IRenderer";
import { clamp, clearDynamic, destroyBodyAt, explodeAt, isDynamic, markDestroyed, scaleBody } from "./Physics";
import { PhysWorld } from "./PhysWorld";
import { Renderer } from "./Renderer";
import { WaterSystem } from "./WaterSystem";

export const KILL_Y = -100;
export const KILL_Y_TOP = 200;
const DEFAULT_PHYSICS_HZ = 60;
const COLLISION_MIN_IMPULSE = 2;
const COLLISION_MAX_IMPULSE = 15;
/** box2d3 sub-steps per physics tick (replaces velocity/position iterations) */
const SUB_STEPS = 4;

function applyMotorTorque(pw: PhysWorld) {
  pw.forEachBody((b) => {
    const ud = getBodyUserData(pw, b);
    if (ud?.motorSpeed != null) b.SetAngularVelocity(ud.motorSpeed);
  });
}

export class Game {
  pw: PhysWorld;
  camera: Camera;
  renderer: IRenderer;
  canvas: HTMLCanvasElement;
  /** Container element for canvases — used for event binding and sizing */
  container: HTMLElement;

  gravity = -10;
  bounciness = 0.5;
  timeScale = 1;
  physicsHz = DEFAULT_PHYSICS_HZ;
  inputManager: InputManager | null = null;
  water = new WaterSystem();
  sandBodies: Body[] = [];
  ragdolls: RagdollData[] = [];
  followSelected = false;
  followBody: Body | null = null;
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
  private prevStates = new WeakMap<Body, { x: number; y: number; angle: number }>();
  private interpAlpha = 1;

  private resizeHandler = () => this.renderer.resize();

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.container = canvas.parentElement!;
    this.pw = new PhysWorld(0, this.gravity);
    this.camera = new Camera();
    this.renderer = new Renderer(canvas);

    this.renderer.resize();
    window.addEventListener("resize", this.resizeHandler);
    unlockAudio();

    this.buildDefaultScene();
    this.bindCollisionSounds();
    this.applyBounciness();
  }

  /** Swap the active renderer at runtime. */
  setRenderer(newRenderer: IRenderer) {
    this.renderer.dispose();
    this.renderer = newRenderer;
    if (this.inputManager) {
      this.renderer.setInputManager(this.inputManager);
    }
    this.renderer.resize();
  }

  private applyBounciness() {
    // In box2d3, restitution is set per-shape material or via world restitution threshold.
    // We use the restitution threshold as a global bounciness control.
    // Individual shape restitution values multiply with this.
    this.pw.setRestitutionThreshold(0);
  }

  /** Compute a 0–1 volume multiplier based on zoom level and whether the
   *  collision point is within (or near) the current viewport. */
  private collisionVolume(wx: number, wy: number): number {
    // Zoom attenuation: default zoom is 30. Fade to near-silence below ~5.
    const zoomFactor = clamp((this.camera.zoom - 2) / 28, 0, 1);
    // Square the curve so it drops off faster when zoomed out
    const zoomVol = zoomFactor * zoomFactor;

    // Viewport proximity: attenuate sounds outside the visible area
    const vp = this.container;
    const halfW = vp.clientWidth / 2 / this.camera.zoom;
    const halfH = vp.clientHeight / 2 / this.camera.zoom;
    const dx = Math.max(0, Math.abs(wx - this.camera.x) - halfW);
    const dy = Math.max(0, Math.abs(wy - this.camera.y) - halfH);
    // Distance outside viewport in world units; fade over ~10m
    const offscreen = Math.sqrt(dx * dx + dy * dy);
    const proximityVol = Math.max(0, 1 - offscreen / 10);

    return zoomVol * proximityVol;
  }

  private bindCollisionSounds() {
    const B2 = b2();
    // Set hit event threshold to our minimum impulse
    B2.b2World_SetHitEventThreshold(this.pw.worldId, COLLISION_MIN_IMPULSE);

    this.pw.onHit((_point, _normal, shapeIdA, shapeIdB, approachSpeed) => {
      if (approachSpeed < COLLISION_MIN_IMPULSE) return;

      const bodyIdA = B2.b2Shape_GetBody(shapeIdA);
      const bodyIdB = B2.b2Shape_GetBody(shapeIdB);
      const pA = B2.b2Body_GetPosition(bodyIdA);
      const pB = B2.b2Body_GetPosition(bodyIdB);

      const vol = this.collisionVolume((pA.x + pB.x) / 2, (pA.y + pB.y) / 2);
      if (vol < 0.01) return;

      const tA = B2.b2Shape_GetType(shapeIdA);
      const tB = B2.b2Shape_GetType(shapeIdB);
      const intensity = Math.min(
        1,
        (approachSpeed - COLLISION_MIN_IMPULSE) / (COLLISION_MAX_IMPULSE - COLLISION_MIN_IMPULSE),
      );

      if (tA.value === B2.b2ShapeType.b2_circleShape.value || tB.value === B2.b2ShapeType.b2_circleShape.value) {
        playBounce(intensity, vol);
      } else if (
        tA.value === B2.b2ShapeType.b2_polygonShape.value ||
        tB.value === B2.b2ShapeType.b2_polygonShape.value
      ) {
        playWoodHit(intensity, vol);
      }
    });
  }

  /** Create a static body with a box shape. */
  private createStaticBox(x: number, y: number, halfW: number, halfH: number, fill: string, label: string): Body {
    const B2 = b2();
    const bodyDef = B2.b2DefaultBodyDef();
    bodyDef.type = B2.b2BodyType.b2_staticBody;
    bodyDef.position = new B2.b2Vec2(x, y);
    const body = this.pw.createBody(bodyDef);

    const shapeDef = B2.b2DefaultShapeDef();
    shapeDef.enableHitEvents = true;
    shapeDef.material.restitution = this.bounciness;
    const box = B2.b2MakeBox(halfW, halfH);
    body.CreatePolygonShape(shapeDef, box);

    this.pw.setUserData(body, { fill, label });
    return body;
  }

  private buildDefaultScene() {
    this.createStaticBox(0, -1, 40, 1, "rgba(60,70,90,0.9)", "ground");
    this.createStaticBox(-40, 10, 1, 12, "rgba(60,70,90,0.9)", "wall");
    this.createStaticBox(40, 10, 1, 12, "rgba(60,70,90,0.9)", "wall");

    this.addBox(0, 5);
    this.addBall(-3, 8, 0.5);
    this.addBall(2, 10, 0.3);
  }

  // --- Prefab delegates (preserve external API) ---
  // NOTE: Prefabs still take planck.World — will fail to compile until Phase 3 migration.
  // After Phase 3, all prefab signatures change from planck.World to PhysWorld.

  addBox(x: number, y: number, w = 1, h = 1) {
    return createBox(this.pw, x, y, w, h);
  }

  addBall(x: number, y: number, radius = 0.5) {
    return createBall(this.pw, x, y, radius);
  }

  addPlatform(x: number, y: number, w: number, angle = 0) {
    return createPlatform(this.pw, x, y, w, angle);
  }

  addChainRope(x: number, y: number, links: number, linkLen = 0.4) {
    return createChainRope(this.pw, x, y, links, linkLen);
  }

  addRopeBetween(x1: number, y1: number, x2: number, y2: number, bodyA: Body | null, bodyB: Body | null) {
    return createRopeBetween(this.pw, x1, y1, x2, y2, bodyA, bodyB);
  }

  addSpring(x1: number, y1: number, x2: number, y2: number, bodyA: Body | null, bodyB: Body | null) {
    const B2 = b2();

    // Use first tracked body as ground anchor for null endpoints
    const firstBody = this.pw.bodies.values().next().value;
    if (!firstBody) return;
    const a = bodyA ?? firstBody;
    const b_ = bodyB ?? firstBody;
    if (a === b_) return;

    const anchorA = new B2.b2Vec2(x1, y1);
    const anchorB = new B2.b2Vec2(x2, y2);
    const dist = B2.b2Distance(anchorA, anchorB);
    const localA = a.GetLocalPoint(anchorA);
    const localB = b_.GetLocalPoint(anchorB);

    const def = B2.b2DefaultDistanceJointDef();
    def.base.bodyIdA = this.pw.getBodyId(a);
    def.base.bodyIdB = this.pw.getBodyId(b_);
    def.length = dist;
    def.enableSpring = true;
    def.hertz = 3;
    def.dampingRatio = 0.3;
    def.base.collideConnected = true;

    const frameA = new B2.b2Transform();
    frameA.p = localA;
    frameA.q = B2.b2Rot_identity;
    def.base.localFrameA = frameA;

    const frameB = new B2.b2Transform();
    frameB.p = localB;
    frameB.q = B2.b2Rot_identity;
    def.base.localFrameB = frameB;

    const jointId = B2.b2CreateDistanceJoint(this.pw.worldId, def);
    this.pw.addJointId(jointId);
  }

  addSpringBall(x: number, y: number) {
    return createSpringBall(this.pw, x, y);
  }

  addLauncher(x: number, y: number) {
    return createLauncher(this.pw, x, y);
  }

  addCar(x: number, y: number) {
    return createCar(this.pw, x, y);
  }

  addSeesaw(x: number, y: number) {
    return createSeesaw(this.pw, x, y);
  }

  addRocket(x: number, y: number, angle = 0) {
    return createRocket(this.pw, x, y, angle);
  }

  addBalloon(x: number, y: number) {
    return createBalloon(this.pw, x, y);
  }

  addRagdoll(x: number, y: number) {
    return createRagdoll(this.pw, x, y, this.ragdolls);
  }

  addCannon(x: number, y: number, angle: number) {
    return createCannon(this.pw, x, y, angle);
  }

  addFan(x: number, y: number, angle: number, force = 15, range = 10) {
    return createFan(this.pw, x, y, angle, force, range);
  }

  addConveyor(x: number, y: number, w = 6, speed = 3, angle = 0) {
    return createConveyor(this.pw, x, y, w, speed, angle);
  }

  addTrain(x: number, y: number) {
    return createTrain(this.pw, x, y);
  }

  addDynamite(x: number, y: number, fuseTime = 3) {
    return createDynamite(this.pw, x, y, fuseTime);
  }

  // --- Physics utilities ---

  explodeAt(wx: number, wy: number, radius: number, force: number) {
    explodeAt(this.pw, this.renderer, wx, wy, radius, force);
  }

  scaleBody(body: Body, scale: number): Body {
    return scaleBody(this.pw, body, scale);
  }

  clearDynamic() {
    clearDynamic(this.pw);
  }

  destroyBodyAt(wx: number, wy: number, radius = 0.5): boolean {
    return destroyBodyAt(this.pw, wx, wy, radius);
  }

  // --- Settings ---

  setBounciness(value: number) {
    this.bounciness = value;
    // TODO: update material restitution on existing shapes or use restitution callback
  }

  setGravity(g: number) {
    this.gravity = g;
    this.pw.setGravity(0, g);
  }

  setGravityXY(gx: number, gy: number) {
    this.gravity = gy;
    this.pw.setGravity(gx, gy);
  }

  reset() {
    this.pw.destroy();
    this.pw = new PhysWorld(0, this.gravity);
    this.applyBounciness();
    this.bindCollisionSounds();
    this.ragdolls.length = 0;
    this.sandBodies.length = 0;
    this.water.clear();
    this.followBody = null;
    this.accumulator = 0;
    if (this.inputManager) {
      this.inputManager.selectedBody = null;
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

    this.updateFPS(dt);

    if (!this.paused) {
      this.stepPhysics(dt);
    }

    this.removeOutOfBoundsBodies();
    this.updateCameraFollow();
    const interp: Interpolation = { alpha: this.interpAlpha, prev: this.prevStates };
    this.renderer.drawWorld(this.pw, this.camera, this.water, interp);
  }

  private updateFPS(dt: number) {
    this.frameCount++;
    this.fpsTimer += dt;
    if (this.fpsTimer >= 1) {
      this.fps = this.frameCount;
      this.frameCount = 0;
      this.fpsTimer = 0;
    }
  }

  private stepPhysics(dt: number) {
    const timestep = 1 / this.physicsHz;
    const scaledDt = dt * this.timeScale;
    tickDynamite(this.pw, scaledDt, (wx, wy, r, f) => this.explodeAt(wx, wy, r, f));
    tickCannons(this.pw, this.renderer, (wx, wy, r, f) => this.explodeAt(wx, wy, r, f), scaledDt);
    this.accumulator += scaledDt;
    while (this.accumulator >= timestep) {
      snapshotBodies(this.pw, this.prevStates);
      this.inputManager?.update();
      for (const rd of this.ragdolls) updateRagdollFootContacts(this.pw, rd);
      applyRocketThrust(this.pw, timestep);
      applyBalloonLift(this.pw);
      applyFanForce(this.pw);
      applyMotorTorque(this.pw);
      applyRopeStabilization(this.pw);
      this.water.tick(this.pw);
      this.water.applyBuoyancy(this.pw, this.gravity);
      this.pw.step(timestep, SUB_STEPS);
      this.accumulator -= timestep;
    }
    this.interpAlpha = this.accumulator / timestep;
    spawnRocketParticles(this.pw, this.renderer);
    spawnFanParticles(this.pw, this.renderer);
  }

  private removeOutOfBoundsBodies() {
    const toRemove: Body[] = [];
    let count = 0;
    this.pw.forEachBody((b) => {
      if (isDynamic(b)) {
        const pos = b.GetPosition();
        if (pos.y < KILL_Y || pos.y > KILL_Y_TOP) {
          toRemove.push(b);
        } else {
          count++;
        }
      }
    });
    for (const b of toRemove) {
      markDestroyed(this.pw, b);
      this.pw.destroyBody(b);
    }
    this.bodyCount = count;

    // Prune sand tracking array of destroyed bodies
    if (toRemove.length > 0 && this.sandBodies.length > 0) {
      this.sandBodies = this.sandBodies.filter((b) => b.IsValid());
    }
  }

  private updateCameraFollow() {
    const sel = this.inputManager?.selectedBody ?? null;
    if (sel && sel !== this.followBody) this.followBody = sel;
    if (this.followSelected && this.followBody?.IsValid()) {
      const pos = this.followBody.GetPosition();
      this.camera.x = pos.x;
      this.camera.y = pos.y;
    }
  }
}
