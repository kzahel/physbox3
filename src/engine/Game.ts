import * as planck from "planck";
import type { InputManager } from "../interaction/InputManager";
import { playBounce, playExplosion, playWoodHit, unlockAudio } from "./Audio";
import { Camera } from "./Camera";
import { Renderer } from "./Renderer";

export const KILL_Y = -100;
const TIMESTEP = 1 / 60;

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
  ragdolls: { torso: planck.Body; footContacts: number }[] = [];
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
        linearDamping: 0.5,
        angularDamping: 2,
      });
      link.createFixture({ shape: planck.Box(0.08, linkLen / 2), density: 2, friction: 0.4 });
      link.setUserData({ fill: "rgba(180,160,120,0.7)" });

      this.world.createJoint(planck.RevoluteJoint({}, prev, link, planck.Vec2(x, y - i * linkLen - linkLen / 2)));
      prev = link;
    }
    return prev; // return last link for attaching things
  }

  addRopeBetween(x1: number, y1: number, x2: number, y2: number, bodyA: planck.Body | null, bodyB: planck.Body | null) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.hypot(dx, dy);
    const linkLen = 0.4;
    const links = Math.max(2, Math.round(dist / linkLen));
    const stepX = dx / links;
    const stepY = dy / links;
    const angle = Math.atan2(dy, dx) - Math.PI / 2; // rotate so long axis aligns with rope direction

    // Start anchor: use existing body or create static anchor
    let prev: planck.Body;
    if (bodyA) {
      prev = bodyA;
    } else {
      prev = this.world.createBody({ type: "static", position: planck.Vec2(x1, y1) });
      prev.createFixture({ shape: planck.Circle(0.15) });
    }

    // Chain links
    for (let i = 1; i < links; i++) {
      const lx = x1 + stepX * i;
      const ly = y1 + stepY * i;
      const link = this.world.createBody({
        type: "dynamic",
        position: planck.Vec2(lx, ly),
        angle,
        linearDamping: 0.5,
        angularDamping: 2,
      });
      link.createFixture({ shape: planck.Box(0.08, linkLen / 2), density: 2, friction: 0.4 });
      link.setUserData({ fill: "rgba(180,160,120,0.7)" });

      const jx = x1 + stepX * (i - 0.5);
      const jy = y1 + stepY * (i - 0.5);
      this.world.createJoint(planck.RevoluteJoint({}, prev, link, planck.Vec2(jx, jy)));
      prev = link;
    }

    // End anchor: attach to existing body or create static anchor
    let end: planck.Body;
    if (bodyB) {
      end = bodyB;
    } else {
      end = this.world.createBody({ type: "static", position: planck.Vec2(x2, y2) });
      end.createFixture({ shape: planck.Circle(0.15) });
    }

    const jx = x1 + stepX * (links - 0.5);
    const jy = y1 + stepY * (links - 0.5);
    this.world.createJoint(planck.RevoluteJoint({}, prev, end, planck.Vec2(jx, jy)));
  }

  addSpringBall(x: number, y: number) {
    const sides = 5;
    const radius = 1.5;

    // Center hub
    const hub = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    hub.createFixture({ shape: planck.Circle(0.3), density: 2, friction: 0.4 });
    hub.setUserData({ fill: "rgba(255,220,50,0.9)" });

    const pods: planck.Body[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;

      const pod = this.world.createBody({ type: "dynamic", position: planck.Vec2(px, py) });
      pod.createFixture({ shape: planck.Circle(0.25), density: 1, friction: 0.6, restitution: 0.5 });
      pod.setUserData({ fill: "rgba(255,100,180,0.8)" });

      // Spring from hub to pod
      this.world.createJoint(
        planck.DistanceJoint(
          { frequencyHz: 5, dampingRatio: 0.3, length: radius },
          hub,
          pod,
          hub.getPosition(),
          pod.getPosition(),
        ),
      );

      pods.push(pod);
    }

    // Springs between adjacent pods to hold shape
    for (let i = 0; i < sides; i++) {
      const a = pods[i];
      const b = pods[(i + 1) % sides];
      const edgeLen = planck.Vec2.lengthOf(planck.Vec2.sub(a.getPosition(), b.getPosition()));
      this.world.createJoint(
        planck.DistanceJoint(
          { frequencyHz: 4, dampingRatio: 0.4, length: edgeLen },
          a,
          b,
          a.getPosition(),
          b.getPosition(),
        ),
      );
    }

    return hub;
  }

  addLauncher(x: number, y: number) {
    // Base (static)
    const base = this.world.createBody({ type: "static", position: planck.Vec2(x, y) });
    base.createFixture({ shape: planck.Box(1.5, 0.3), friction: 0.5 });
    base.setUserData({ fill: "rgba(100,100,120,0.9)" });

    // Piston rod (dynamic, thin vertical piece)
    const rod = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 1.5) });
    rod.createFixture({ shape: planck.Box(0.15, 1), density: 0.5, friction: 0.2 });
    rod.setUserData({ fill: "rgba(160,160,180,0.8)" });

    // Platform on top (dynamic, wide)
    const plat = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 2.8) });
    plat.createFixture({ shape: planck.Box(2, 0.2), density: 1, friction: 0.7 });
    plat.setUserData({ fill: "rgba(80,180,80,0.8)" });

    // Weld rod to platform
    this.world.createJoint(planck.WeldJoint({}, rod, plat, planck.Vec2(x, y + 2.5)));

    // Piston joint: base to rod, slides vertically
    const piston = this.world.createJoint(
      planck.PrismaticJoint(
        {
          enableLimit: true,
          lowerTranslation: 0,
          upperTranslation: 3,
          enableMotor: true,
          maxMotorForce: 200,
          motorSpeed: 5,
        },
        base,
        rod,
        planck.Vec2(x, y),
        planck.Vec2(0, 1),
      ),
    ) as planck.PrismaticJoint;

    // Oscillate the motor by reversing at limits
    const oscillate = () => {
      if (!piston.isActive()) return;
      const t = piston.getJointTranslation();
      const upper = 3;
      if (t >= upper * 0.95) piston.setMotorSpeed(-8);
      else if (t <= 0.05) piston.setMotorSpeed(5);
      requestAnimationFrame(oscillate);
    };
    requestAnimationFrame(oscillate);

    return plat;
  }

  addCar(x: number, y: number) {
    const r = Math.random;

    // Random size multiplier (0.7 – 1.4)
    const sz = 0.7 + r() * 0.7;
    const halfW = 2 * sz;
    const halfH = 0.5 * sz;

    // Random body color
    const hue = Math.floor(r() * 360);
    const sat = 50 + Math.floor(r() * 40);
    const lit = 40 + Math.floor(r() * 25);
    const bodyColor = `hsla(${hue},${sat}%,${lit}%,0.85)`;

    // Random wheel color (dark grays / browns)
    const wg = 30 + Math.floor(r() * 40);
    const wheelColor = `rgba(${wg},${wg},${Math.floor(wg * 0.8)},0.9)`;

    // Chassis
    const chassis = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    chassis.createFixture({ shape: planck.Box(halfW, halfH), density: 0.8 + r() * 0.6, friction: 0.3 });
    chassis.setUserData({ fill: bodyColor, label: "car" });

    // Body style variant
    const style = Math.floor(r() * 4);
    if (style === 0) {
      // Sedan: symmetric cab
      chassis.createFixture({
        shape: planck.Polygon([
          planck.Vec2(-halfW * 0.6, halfH),
          planck.Vec2(-halfW * 0.3, halfH + halfH * 1.2),
          planck.Vec2(halfW * 0.5, halfH + halfH * 1.2),
          planck.Vec2(halfW * 0.7, halfH),
        ]),
        density: 0.5,
      });
    } else if (style === 1) {
      // Truck: flat bed + small cab
      chassis.createFixture({
        shape: planck.Polygon([
          planck.Vec2(halfW * 0.3, halfH),
          planck.Vec2(halfW * 0.3, halfH + halfH * 1.4),
          planck.Vec2(halfW * 0.9, halfH + halfH * 1.4),
          planck.Vec2(halfW * 0.9, halfH),
        ]),
        density: 0.4,
      });
    } else if (style === 2) {
      // Sports: low wedge
      chassis.createFixture({
        shape: planck.Polygon([
          planck.Vec2(-halfW * 0.8, halfH),
          planck.Vec2(-halfW * 0.2, halfH + halfH * 0.8),
          planck.Vec2(halfW * 0.6, halfH + halfH * 0.8),
          planck.Vec2(halfW * 0.9, halfH),
        ]),
        density: 0.6,
      });
    } else {
      // SUV: tall boxy top
      chassis.createFixture({
        shape: planck.Polygon([
          planck.Vec2(-halfW * 0.7, halfH),
          planck.Vec2(-halfW * 0.7, halfH + halfH * 1.6),
          planck.Vec2(halfW * 0.7, halfH + halfH * 1.6),
          planck.Vec2(halfW * 0.7, halfH),
        ]),
        density: 0.4,
      });
    }

    // Random motor params
    const motorSpeed = -(6 + r() * 14); // -6 to -20
    const torque = 25 + r() * 75; // 25 to 100

    const rearWheelRadius = (0.3 + r() * 0.45) * sz;
    const frontWheelRadius = (0.3 + r() * 0.45) * sz;
    const suspAxis = planck.Vec2(0, 1);

    const rearWheelOpts = {
      enableMotor: true,
      motorSpeed,
      maxMotorTorque: torque,
      frequencyHz: 1.5 + r() * 6,
      dampingRatio: 0.2 + r() * 0.8,
    };
    const frontWheelOpts = {
      enableMotor: true,
      motorSpeed,
      maxMotorTorque: torque,
      frequencyHz: 1.5 + r() * 6,
      dampingRatio: 0.2 + r() * 0.8,
    };

    const wheelX = halfW * 0.6;

    // Rear wheel
    const rearY = -(halfH + rearWheelRadius * 0.4);
    const rearWheel = this.world.createBody({ type: "dynamic", position: planck.Vec2(x - wheelX, y + rearY) });
    rearWheel.createFixture({ shape: planck.Circle(rearWheelRadius), density: 1, friction: 0.7 + r() * 0.3 });
    rearWheel.setUserData({ fill: wheelColor });
    this.world.createJoint(planck.WheelJoint(rearWheelOpts, chassis, rearWheel, rearWheel.getPosition(), suspAxis));

    // Front wheel
    const frontY = -(halfH + frontWheelRadius * 0.4);
    const frontWheel = this.world.createBody({ type: "dynamic", position: planck.Vec2(x + wheelX, y + frontY) });
    frontWheel.createFixture({ shape: planck.Circle(frontWheelRadius), density: 1, friction: 0.7 + r() * 0.3 });
    frontWheel.setUserData({ fill: wheelColor });
    this.world.createJoint(planck.WheelJoint(frontWheelOpts, chassis, frontWheel, frontWheel.getPosition(), suspAxis));

    return chassis;
  }

  addSeesaw(x: number, y: number) {
    // Triangular fulcrum (static)
    const fulcrum = this.world.createBody({ type: "static", position: planck.Vec2(x, y) });
    fulcrum.createFixture({
      shape: planck.Polygon([planck.Vec2(-0.6, 0), planck.Vec2(0.6, 0), planck.Vec2(0, 0.8)]),
      friction: 0.5,
    });
    fulcrum.setUserData({ fill: "rgba(140,120,100,0.9)" });

    // Plank (dynamic)
    const plank = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 1) });
    plank.createFixture({ shape: planck.Box(3, 0.15), density: 1, friction: 0.7 });
    plank.setUserData({ fill: "rgba(180,140,80,0.9)" });

    // Hinge at the top of the fulcrum
    this.world.createJoint(planck.RevoluteJoint({}, fulcrum, plank, planck.Vec2(x, y + 0.8)));

    return plank;
  }

  addRocket(x: number, y: number) {
    const body = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    // Rocket body (tall narrow rectangle)
    body.createFixture({ shape: planck.Box(0.3, 0.8), density: 1.5, friction: 0.3 });
    // Nose cone
    body.createFixture({
      shape: planck.Polygon([planck.Vec2(-0.3, 0.8), planck.Vec2(0.3, 0.8), planck.Vec2(0, 1.4)]),
      density: 0.5,
    });
    // Fins
    body.createFixture({
      shape: planck.Polygon([planck.Vec2(-0.3, -0.8), planck.Vec2(-0.7, -1.0), planck.Vec2(-0.3, -0.3)]),
      density: 0.3,
    });
    body.createFixture({
      shape: planck.Polygon([planck.Vec2(0.3, -0.8), planck.Vec2(0.7, -1.0), planck.Vec2(0.3, -0.3)]),
      density: 0.3,
    });
    body.setUserData({ fill: "rgba(200,200,220,0.9)", label: "rocket", thrust: 40 });
    return body;
  }

  addBalloon(x: number, y: number) {
    const r = Math.random;
    const radius = 0.5 + r() * 0.3;
    const hue = Math.floor(r() * 360);
    const color = `hsla(${hue},70%,55%,0.75)`;

    // Balloon body (circle, very light)
    const body = this.world.createBody({
      type: "dynamic",
      position: planck.Vec2(x, y),
      linearDamping: 0.5,
      angularDamping: 1,
    });
    body.createFixture({ shape: planck.Circle(radius), density: 0.05, friction: 0.1, restitution: 0.4 });

    // Small weight at the bottom (string knot)
    body.createFixture({
      shape: planck.Circle(planck.Vec2(0, -radius - 0.15), 0.06),
      density: 0.5,
    });

    const lift = 12 + r() * 8; // buoyancy force multiplier
    body.setUserData({ fill: color, label: "balloon", lift });
    return body;
  }

  addRagdoll(x: number, y: number) {
    const hue = Math.floor(Math.random() * 360);
    const skinColor = `hsla(${(hue + 30) % 360},40%,70%,0.85)`;
    const shirtColor = `hsla(${hue},60%,45%,0.85)`;
    const pantsColor = `hsla(${(hue + 180) % 360},50%,35%,0.85)`;

    const jointOpts = { lowerAngle: -Math.PI / 3, upperAngle: Math.PI / 3, enableLimit: true };

    // Head
    const head = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 2.1) });
    head.createFixture({ shape: planck.Circle(0.25), density: 1, friction: 0.3 });
    head.setUserData({ fill: skinColor, label: "ragdoll" });

    // Torso
    const torso = this.world.createBody({
      type: "dynamic",
      position: planck.Vec2(x, y + 1.2),
      fixedRotation: true,
    });
    torso.createFixture({ shape: planck.Box(0.25, 0.55), density: 2, friction: 0.3 });
    torso.setUserData({ fill: shirtColor, label: "ragdoll-torso" });

    // Neck joint
    this.world.createJoint(
      planck.RevoluteJoint(
        { lowerAngle: -Math.PI / 6, upperAngle: Math.PI / 6, enableLimit: true },
        torso,
        head,
        planck.Vec2(x, y + 1.85),
      ),
    );

    // Left arm
    const lArm = this.world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.55, y + 1.4) });
    lArm.createFixture({ shape: planck.Box(0.08, 0.35), density: 0.5, friction: 0.3 });
    lArm.setUserData({ fill: skinColor, label: "ragdoll" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, torso, lArm, planck.Vec2(x - 0.3, y + 1.7)));

    // Right arm
    const rArm = this.world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.55, y + 1.4) });
    rArm.createFixture({ shape: planck.Box(0.08, 0.35), density: 0.5, friction: 0.3 });
    rArm.setUserData({ fill: skinColor, label: "ragdoll" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, torso, rArm, planck.Vec2(x + 0.3, y + 1.7)));

    // Left upper leg
    const lULeg = this.world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.15, y + 0.4) });
    lULeg.createFixture({ shape: planck.Box(0.1, 0.3), density: 1, friction: 0.3 });
    lULeg.setUserData({ fill: pantsColor, label: "ragdoll" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, torso, lULeg, planck.Vec2(x - 0.15, y + 0.65)));

    // Left lower leg (foot)
    const lFoot = this.world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.15, y - 0.15) });
    lFoot.createFixture({ shape: planck.Box(0.1, 0.25), density: 1, friction: 0.8 });
    lFoot.setUserData({ fill: pantsColor, label: "ragdoll-foot" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, lULeg, lFoot, planck.Vec2(x - 0.15, y + 0.1)));

    // Right upper leg
    const rULeg = this.world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.15, y + 0.4) });
    rULeg.createFixture({ shape: planck.Box(0.1, 0.3), density: 1, friction: 0.3 });
    rULeg.setUserData({ fill: pantsColor, label: "ragdoll" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, torso, rULeg, planck.Vec2(x + 0.15, y + 0.65)));

    // Right lower leg (foot)
    const rFoot = this.world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.15, y - 0.15) });
    rFoot.createFixture({ shape: planck.Box(0.1, 0.25), density: 1, friction: 0.8 });
    rFoot.setUserData({ fill: pantsColor, label: "ragdoll-foot" });
    this.world.createJoint(planck.RevoluteJoint(jointOpts, rULeg, rFoot, planck.Vec2(x + 0.15, y + 0.1)));

    const ragdoll = { torso, footContacts: 0 };
    this.ragdolls.push(ragdoll);

    // Track foot ground contacts
    this.world.on("begin-contact", (contact) => {
      const fA = contact.getFixtureA().getBody();
      const fB = contact.getFixtureB().getBody();
      const feet = [lFoot, rFoot];
      const aIsFoot = feet.includes(fA);
      const bIsFoot = feet.includes(fB);
      if (
        (aIsFoot && fB !== torso && fB !== lULeg && fB !== rULeg) ||
        (bIsFoot && fA !== torso && fA !== lULeg && fA !== rULeg)
      ) {
        ragdoll.footContacts++;
      }
    });
    this.world.on("end-contact", (contact) => {
      const fA = contact.getFixtureA().getBody();
      const fB = contact.getFixtureB().getBody();
      const feet = [lFoot, rFoot];
      const aIsFoot = feet.includes(fA);
      const bIsFoot = feet.includes(fB);
      if (
        (aIsFoot && fB !== torso && fB !== lULeg && fB !== rULeg) ||
        (bIsFoot && fA !== torso && fA !== lULeg && fA !== rULeg)
      ) {
        ragdoll.footContacts = Math.max(0, ragdoll.footContacts - 1);
      }
    });

    return torso;
  }

  addCannon(x: number, y: number, angle: number) {
    // Cannon barrel
    const body = this.world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
    body.createFixture({ shape: planck.Box(0.6, 0.3), friction: 0.5 });
    // Barrel nozzle
    body.createFixture({
      shape: planck.Polygon([
        planck.Vec2(0.4, -0.35),
        planck.Vec2(0.8, -0.35),
        planck.Vec2(0.8, 0.35),
        planck.Vec2(0.4, 0.35),
      ]),
    });
    body.setUserData({ fill: "rgba(80,80,90,0.9)", label: "cannon" });

    const world = this.world;
    const renderer = this.renderer;

    const fire = () => {
      if (!body.isActive()) return;
      const pos = body.getPosition();
      const a = body.getAngle();
      const dirX = Math.cos(a);
      const dirY = Math.sin(a);

      // Spawn cannonball at the barrel tip
      const spawnX = pos.x + dirX * 1.0;
      const spawnY = pos.y + dirY * 1.0;
      const ball = world.createBody({ type: "dynamic", position: planck.Vec2(spawnX, spawnY) });
      ball.createFixture({ shape: planck.Circle(0.2), density: 5, friction: 0.3, restitution: 0.1 });
      ball.setUserData({ fill: "rgba(40,40,40,0.9)", label: "cannonball" });
      ball.setBullet(true);

      // Launch velocity
      const speed = 20;
      ball.setLinearVelocity(planck.Vec2(dirX * speed, dirY * speed));

      // Muzzle flash particles
      renderer.spawnExplosion(spawnX, spawnY);

      // Explode on first contact
      let exploded = false;
      world.on("begin-contact", (contact) => {
        if (exploded) return;
        const fA = contact.getFixtureA().getBody();
        const fB = contact.getFixtureB().getBody();
        if (fA !== ball && fB !== ball) return;
        // Don't explode on the cannon itself
        if (fA === body || fB === body) return;
        exploded = true;
        setTimeout(() => {
          if (!ball.isActive()) return;
          this.explodeAt(ball.getPosition().x, ball.getPosition().y, 5, 20);
          world.destroyBody(ball);
        }, 0);
      });

      // Self-destruct after 5s if no contact
      setTimeout(() => {
        if (!exploded && ball.isActive()) world.destroyBody(ball);
      }, 5000);

      setTimeout(fire, 1000);
    };
    setTimeout(fire, 500);

    return body;
  }

  /** Reusable explosion: particles, sound, radial impulse */
  explodeAt(wx: number, wy: number, radius: number, force: number) {
    const center = planck.Vec2(wx, wy);
    this.renderer.spawnExplosion(wx, wy);
    playExplosion(0.3);

    const affected: { body: planck.Body; dist: number }[] = [];
    this.world.queryAABB(
      planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
      (fixture) => {
        const b = fixture.getBody();
        if (!b.isDynamic()) return true;
        const d = planck.Vec2.lengthOf(planck.Vec2.sub(b.getPosition(), center));
        if (d < radius) affected.push({ body: b, dist: d });
        return true;
      },
    );

    for (const { body: b, dist } of affected) {
      const dir = planck.Vec2.sub(b.getPosition(), center);
      const len = planck.Vec2.lengthOf(dir);
      if (len < 0.01) continue;
      const falloff = 1 - dist / radius;
      const impulse = planck.Vec2.mul(dir, (force * falloff * b.getMass()) / len);
      b.applyLinearImpulse(impulse, b.getPosition(), true);
    }
  }

  addFan(x: number, y: number, angle: number, force = 15, range = 10) {
    const body = this.world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
    body.createFixture({ shape: planck.Box(0.4, 0.25), friction: 0.5 });
    body.setUserData({ fill: "rgba(120,180,220,0.85)", label: "fan", force, range });
    return body;
  }

  addConveyor(x: number, y: number, w = 6, speed = 3, angle = 0) {
    const body = this.world.createBody({ type: "kinematic", position: planck.Vec2(x, y), angle });
    const fixture = body.createFixture({ shape: planck.Box(w / 2, 0.2), friction: 1 });
    fixture.setUserData({ fill: "rgba(200,160,50,0.8)", stroke: "rgba(200,160,50,0.5)" });
    body.setUserData({ fill: "rgba(200,160,50,0.8)", label: "conveyor", speed });

    // Surface velocity: read speed from userData so it can be toggled
    this.world.on("pre-solve", (contact) => {
      const fA = contact.getFixtureA();
      const fB = contact.getFixtureB();
      if (fA === fixture || fB === fixture) {
        const ud = body.getUserData() as { speed?: number } | null;
        contact.setTangentSpeed(ud?.speed ?? speed);
      }
    });

    return body;
  }

  addDynamite(x: number, y: number, fuseTime = 3) {
    const body = this.world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
    body.createFixture({ shape: planck.Box(0.25, 0.4), density: 2, friction: 0.5 });
    body.setUserData({
      fill: "rgba(255,50,30,0.9)",
      label: "dynamite",
      fuseStart: performance.now(),
      fuseDuration: fuseTime,
    });

    const world = this.world;

    setTimeout(() => {
      if (!body.isActive()) return;
      const pos = body.getPosition();
      this.explodeAt(pos.x, pos.y, 8, 30);
      world.destroyBody(body);
    }, fuseTime * 1000);

    return body;
  }

  scaleBody(body: planck.Body, scale: number): planck.Body {
    const pos = body.getPosition();
    const angle = body.getAngle();
    const vel = body.getLinearVelocity();
    const angVel = body.getAngularVelocity();
    const type = body.getType();
    const userData = body.getUserData();
    const linearDamping = body.getLinearDamping();
    const angularDamping = body.getAngularDamping();

    // Collect fixture data
    const fixtures: {
      density: number;
      friction: number;
      restitution: number;
      isSensor: boolean;
      userData: unknown;
      shapeType: string;
      // Circle
      radius?: number;
      center?: { x: number; y: number };
      // Polygon
      verts?: { x: number; y: number }[];
    }[] = [];

    for (let f = body.getFixtureList(); f; f = f.getNext()) {
      const shape = f.getShape();
      const fd = {
        density: f.getDensity(),
        friction: f.getFriction(),
        restitution: f.getRestitution(),
        isSensor: f.isSensor(),
        userData: f.getUserData(),
        shapeType: shape.getType(),
      } as (typeof fixtures)[number];

      if (shape.getType() === "circle") {
        const circle = shape as planck.CircleShape;
        const c = circle.getCenter();
        fd.radius = circle.getRadius() * scale;
        fd.center = { x: c.x * scale, y: c.y * scale };
      } else if (shape.getType() === "polygon") {
        const poly = shape as planck.PolygonShape;
        fd.verts = poly.m_vertices.map((v) => ({ x: v.x * scale, y: v.y * scale }));
      } else {
        continue;
      }
      fixtures.push(fd);
    }

    this.world.destroyBody(body);

    const newBody = this.world.createBody({
      type,
      position: planck.Vec2(pos.x, pos.y),
      angle,
      linearDamping,
      angularDamping,
    });
    newBody.setLinearVelocity(planck.Vec2(vel.x, vel.y));
    newBody.setAngularVelocity(angVel);
    newBody.setUserData(userData);

    for (const fd of fixtures) {
      let shape: planck.Shape;
      if (fd.shapeType === "circle") {
        shape = planck.Circle(planck.Vec2(fd.center!.x, fd.center!.y), fd.radius!);
      } else {
        shape = planck.Polygon(fd.verts!.map((v) => planck.Vec2(v.x, v.y)));
      }
      const fix = newBody.createFixture({
        shape,
        density: fd.density,
        friction: fd.friction,
        restitution: fd.restitution,
        isSensor: fd.isSensor,
      });
      if (fd.userData) fix.setUserData(fd.userData);
    }

    return newBody;
  }

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
    // Re-create the ground body used by InputManager
    if (this.inputManager) {
      this.inputManager.resetGroundBody();
    }
    this.buildDefaultScene();
  }

  private applyRocketThrust() {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const ud = b.getUserData() as { label?: string; thrust?: number } | null;
      if (ud?.label !== "rocket" || !ud.thrust) continue;
      const angle = b.getAngle();
      // Thrust along the body's local "up" direction
      const fx = -Math.sin(angle) * ud.thrust * b.getMass();
      const fy = Math.cos(angle) * ud.thrust * b.getMass();
      b.applyForceToCenter(planck.Vec2(fx, fy), true);

      // Spawn flame particles from the exhaust (bottom of rocket)
      const pos = b.getPosition();
      const exhaustX = pos.x + Math.sin(angle) * 1.0;
      const exhaustY = pos.y - Math.cos(angle) * 1.0;
      this.renderer.spawnFlame(exhaustX, exhaustY, angle);
    }
  }

  private applyFanForce() {
    for (let fan = this.world.getBodyList(); fan; fan = fan.getNext()) {
      const ud = fan.getUserData() as { label?: string; force?: number; range?: number } | null;
      if (ud?.label !== "fan") continue;

      const pos = fan.getPosition();
      const angle = fan.getAngle();
      const force = ud.force ?? 15;
      const range = ud.range ?? 10;
      const dirX = Math.cos(angle);
      const dirY = Math.sin(angle);

      // Query AABB covering the fan's blast zone
      const endX = pos.x + dirX * range;
      const endY = pos.y + dirY * range;
      const minX = Math.min(pos.x, endX) - 2;
      const minY = Math.min(pos.y, endY) - 2;
      const maxX = Math.max(pos.x, endX) + 2;
      const maxY = Math.max(pos.y, endY) + 2;

      const affected = new Set<planck.Body>();
      this.world.queryAABB(planck.AABB(planck.Vec2(minX, minY), planck.Vec2(maxX, maxY)), (fixture) => {
        const b = fixture.getBody();
        if (!b.isDynamic() || b === fan) return true;

        const bp = b.getPosition();
        const dx = bp.x - pos.x;
        const dy = bp.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 0.1 || dist > range) return true;

        // Check body is roughly in front of the fan (within ~90° cone)
        const dot = (dx * dirX + dy * dirY) / dist;
        if (dot < 0.3) return true;

        affected.add(b);
        return true;
      });

      for (const b of affected) {
        const bp = b.getPosition();
        const dist = Math.hypot(bp.x - pos.x, bp.y - pos.y);
        const falloff = 1 - dist / range;
        const f = force * falloff * b.getMass();
        b.applyForceToCenter(planck.Vec2(dirX * f, dirY * f), true);
      }

      // Spawn wind particles
      this.renderer.spawnWind(pos.x, pos.y, angle, range);
    }
  }

  private applyBalloonLift() {
    for (let b = this.world.getBodyList(); b; b = b.getNext()) {
      if (!b.isDynamic()) continue;
      const ud = b.getUserData() as { label?: string; lift?: number } | null;
      if (ud?.label !== "balloon" || !ud.lift) continue;
      // Upward force opposing gravity
      b.applyForceToCenter(planck.Vec2(0, ud.lift * b.getMass()), true);
    }
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
        if (fixture.testPoint(point)) {
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
      this.applyRocketThrust();
      this.applyBalloonLift();
      this.applyFanForce();
      this.accumulator += dt * this.timeScale;
      while (this.accumulator >= TIMESTEP) {
        this.world.step(TIMESTEP, this.velocityIterations, this.positionIterations);
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
