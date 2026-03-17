import type { Game } from "../engine/Game";

export class TiltGravity {
  private game: Game;
  private active = false;
  private orientationHandler: ((e: DeviceOrientationEvent) => void) | null = null;
  private motionHandler: ((e: DeviceMotionEvent) => void) | null = null;
  private magnitude: number;

  // Tilt-derived gravity components
  private tiltGx = 0;
  private tiltGy = 0;

  // Device acceleration (inertial frame pseudo-force)
  private accelX = 0;
  private accelY = 0;

  // Smoothing factor to reduce jitter (0 = no smoothing, 1 = frozen)
  private static readonly ACCEL_SMOOTH = 0.15;
  // Scale factor for inertial effect (1.0 = physically accurate, higher = more dramatic)
  private static readonly ACCEL_SCALE = 3.0;

  constructor(game: Game) {
    this.game = game;
    this.magnitude = Math.abs(game.gravity) || 10;
  }

  static isSupported(): boolean {
    return "DeviceOrientationEvent" in window;
  }

  isActive() {
    return this.active;
  }

  async toggle(): Promise<boolean> {
    if (this.active) {
      this.stop();
      return false;
    }
    return this.start();
  }

  private async start(): Promise<boolean> {
    // iOS 13+ requires permission
    const DOE = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (typeof DOE.requestPermission === "function") {
      const perm = await DOE.requestPermission();
      if (perm !== "granted") return false;
    }

    this.magnitude = Math.abs(this.game.gravity) || 10;
    this.tiltGx = 0;
    this.tiltGy = -this.magnitude;
    this.accelX = 0;
    this.accelY = 0;

    this.orientationHandler = (e) => this.onOrientation(e);
    window.addEventListener("deviceorientation", this.orientationHandler);

    this.motionHandler = (e) => this.onMotion(e);
    window.addEventListener("devicemotion", this.motionHandler);

    this.active = true;
    return true;
  }

  private stop() {
    if (this.orientationHandler) {
      window.removeEventListener("deviceorientation", this.orientationHandler);
      this.orientationHandler = null;
    }
    if (this.motionHandler) {
      window.removeEventListener("devicemotion", this.motionHandler);
      this.motionHandler = null;
    }
    this.active = false;
    this.game.setGravity(-this.magnitude);
  }

  private onOrientation(e: DeviceOrientationEvent) {
    if (e.gamma == null || e.beta == null) return;

    const g = this.magnitude;
    const betaRad = (e.beta * Math.PI) / 180;
    const gammaRad = (e.gamma * Math.PI) / 180;

    this.tiltGx = g * Math.cos(betaRad) * Math.sin(gammaRad);
    this.tiltGy = -g * Math.sin(betaRad);

    this.applyGravity();
  }

  private onMotion(e: DeviceMotionEvent) {
    // Prefer gravity-subtracted acceleration (pure user motion).
    // Fall back to accelerationIncludingGravity minus our tilt-derived gravity
    // (many devices don't provide the separated acceleration).
    let ax: number;
    let ay: number;
    const a = e.acceleration;
    if (a && a.x != null && a.y != null) {
      ax = a.x;
      ay = a.y;
    } else {
      const ag = e.accelerationIncludingGravity;
      if (!ag || ag.x == null || ag.y == null) return;
      // accelerationIncludingGravity is in device frame and includes ~9.8 m/s²
      // from Earth gravity. Subtract what we already model via tilt gravity
      // (tiltGx/tiltGy are in world coords which match device coords here).
      ax = ag.x - this.tiltGx;
      ay = ag.y - -this.tiltGy; // ag.y positive = up in device frame, tiltGy is world (Y-up negated)
    }

    // Device coords: x = right, y = up (in portrait).
    // In the inertial frame, accelerating the phone right means objects
    // experience a pseudo-force to the left: negate both axes.
    const k = TiltGravity.ACCEL_SMOOTH;
    const s = TiltGravity.ACCEL_SCALE;
    this.accelX = this.accelX * k + -ax * s * (1 - k);
    this.accelY = this.accelY * k + -ay * s * (1 - k);

    this.applyGravity();
  }

  private applyGravity() {
    // Combine tilt gravity with inertial pseudo-force
    this.game.setGravityXY(this.tiltGx + this.accelX, this.tiltGy + this.accelY);
  }
}
