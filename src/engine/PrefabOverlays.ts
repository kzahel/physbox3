import type * as planck from "planck";
import { getBodyUserData, isBalloon, isConveyor, isDynamite } from "./BodyUserData";
import type { Camera } from "./Camera";
import { type Interpolation, lerpBody, NO_INTERP } from "./Interpolation";
import type { IParticleSystem } from "./IRenderer";
import { forEachBody } from "./Physics";

// Conveyor animation
const CONVEYOR_SPACING = 0.8;
const CONVEYOR_CHEVRON_SCALE = 0.15;

// Balloon string rendering
const BALLOON_STRING_LENGTH_FACTOR = 3;
const BALLOON_STRING_SEGMENTS = 3;
const BALLOON_STRING_WOBBLE = 4;
const BALLOON_SHINE_SCALE = 0.3;

// Dynamite wick rendering
const WICK_BASE_OFFSET = 0.4;
const WICK_MAX_LENGTH = 0.5;
const WICK_GLOW_MIN_RADIUS = 4;
const WICK_GLOW_RADIUS_JITTER = 3;

export function drawConveyorAnimation(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: planck.World,
  camera: Camera,
  interp: Interpolation = NO_INTERP,
) {
  const time = performance.now() / 1000;

  forEachBody(world, (body) => {
    const ud = getBodyUserData(body);
    if (!isConveyor(ud)) return;

    const speed = ud.speed;
    const { x, y, angle } = lerpBody(body, interp);
    const fixture = body.getFixtureList();
    if (!fixture) return;
    const shape = fixture.getShape() as planck.PolygonShape;
    const hw = Math.abs(shape.m_vertices[0].x);

    ctx.save();
    const screen = camera.toScreen(x, y, canvas);
    ctx.translate(screen.x, screen.y);
    ctx.rotate(-angle);

    const offset = (time * speed) % CONVEYOR_SPACING;
    const count = Math.ceil((hw * 2) / CONVEYOR_SPACING) + 1;
    const chevronSize = CONVEYOR_CHEVRON_SCALE * camera.zoom;

    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = Math.max(1, 0.06 * camera.zoom);
    ctx.lineCap = "round";

    for (let i = 0; i < count; i++) {
      const lx = (-hw + offset + i * CONVEYOR_SPACING) * camera.zoom;
      if (Math.abs(lx) > hw * camera.zoom) continue;
      const ly = 0;
      const dir = speed > 0 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(lx - chevronSize * dir, ly - chevronSize);
      ctx.lineTo(lx, ly);
      ctx.lineTo(lx - chevronSize * dir, ly + chevronSize);
      ctx.stroke();
    }

    ctx.restore();
  });
}

export function drawBalloonStrings(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: planck.World,
  camera: Camera,
  interp: Interpolation = NO_INTERP,
) {
  forEachBody(world, (body) => {
    const ud = getBodyUserData(body);
    if (!isBalloon(ud)) return;

    const { x: posX, y: posY, angle } = lerpBody(body, interp);
    const fixture = body.getFixtureList();
    if (!fixture) return;
    const shape = fixture.getShape() as planck.CircleShape;
    const radius = shape.getRadius();

    const bottomX = posX - Math.sin(angle) * radius;
    const bottomY = posY - Math.cos(angle) * radius;
    const stringLen = radius * BALLOON_STRING_LENGTH_FACTOR;
    const sp = camera.toScreen(bottomX, bottomY, canvas);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(sp.x, sp.y);
    const segLen = (stringLen * camera.zoom) / BALLOON_STRING_SEGMENTS;
    for (let i = 0; i < BALLOON_STRING_SEGMENTS; i++) {
      const wobble = (i % 2 === 0 ? 1 : -1) * BALLOON_STRING_WOBBLE;
      ctx.quadraticCurveTo(sp.x + wobble, sp.y + segLen * (i + 0.5), sp.x, sp.y + segLen * (i + 1));
    }
    ctx.strokeStyle = ud.fill ?? "rgba(200,200,200,0.6)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Highlight / shine on the balloon
    const center = camera.toScreen(posX, posY, canvas);
    const shineR = radius * camera.zoom * BALLOON_SHINE_SCALE;
    ctx.beginPath();
    ctx.arc(center.x - shineR, center.y - shineR, shineR, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    ctx.fill();
    ctx.restore();
  });
}

export function drawDynamiteEffects(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  world: planck.World,
  camera: Camera,
  particles: IParticleSystem,
  interp: Interpolation = NO_INTERP,
) {
  forEachBody(world, (body) => {
    const ud = getBodyUserData(body);
    if (!isDynamite(ud)) return;

    const remaining = Math.max(0, ud.fuseRemaining / ud.fuseDuration);

    const { x: posX, y: posY, angle } = lerpBody(body, interp);

    const wickBaseX = posX + Math.sin(-angle) * WICK_BASE_OFFSET;
    const wickBaseY = posY + Math.cos(-angle) * WICK_BASE_OFFSET;
    const wickLen = WICK_MAX_LENGTH * remaining;
    const wickEndX = wickBaseX + Math.sin(-angle) * wickLen;
    const wickEndY = wickBaseY + Math.cos(-angle) * wickLen;

    const wbSp = camera.toScreen(wickBaseX, wickBaseY, canvas);
    const weSp = camera.toScreen(wickEndX, wickEndY, canvas);

    ctx.beginPath();
    ctx.moveTo(wbSp.x, wbSp.y);
    ctx.lineTo(weSp.x, weSp.y);
    ctx.strokeStyle = "rgba(80,60,40,0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();

    if (remaining > 0) {
      particles.spawnSpark(wickEndX, wickEndY);
      ctx.beginPath();
      ctx.arc(weSp.x, weSp.y, WICK_GLOW_MIN_RADIUS + Math.random() * WICK_GLOW_RADIUS_JITTER, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 100)},50,${0.5 + Math.random() * 0.3})`;
      ctx.fill();
    }
  });
}
