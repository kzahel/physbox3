import * as planck from "planck";
import { type CannonballData, type CannonData, getBodyUserData, isCannon, isCannonball } from "../engine/BodyUserData";
import type { IRenderer } from "../engine/IRenderer";
import { createWorldListener, forEachBodyByLabel, markDestroyed } from "../engine/Physics";

const CANNON_FIRE_INTERVAL = 1; // seconds between shots
const CANNONBALL_SPEED = 20;
const CANNONBALL_LIFETIME = 5; // seconds before auto-despawn
const CANNONBALL_EXPLOSION_RADIUS = 5;
const CANNONBALL_EXPLOSION_FORCE = 20;

export function createCannon(world: planck.World, x: number, y: number, angle: number): planck.Body {
  const body = world.createBody({ type: "static", position: planck.Vec2(x, y), angle });
  body.createFixture({ shape: planck.Box(0.6, 0.3), friction: 0.5 });
  body.createFixture({
    shape: planck.Polygon([
      planck.Vec2(0.4, -0.35),
      planck.Vec2(0.8, -0.35),
      planck.Vec2(0.8, 0.35),
      planck.Vec2(0.4, 0.35),
    ]),
  });
  body.setUserData({ fill: "rgba(80,80,90,0.9)", label: "cannon", cannonCooldown: 0.5 } satisfies CannonData);
  return body;
}

/** Fire a cannonball from a cannon body */
function fireCannon(world: planck.World, cannon: planck.Body, renderer: IRenderer) {
  const pos = cannon.getPosition();
  const a = cannon.getAngle();
  const dirX = Math.cos(a);
  const dirY = Math.sin(a);

  const spawnX = pos.x + dirX * 1.0;
  const spawnY = pos.y + dirY * 1.0;
  const ball = world.createBody({ type: "dynamic", position: planck.Vec2(spawnX, spawnY) });
  ball.createFixture({ shape: planck.Circle(0.2), density: 5, friction: 0.3, restitution: 0.1 });
  ball.setUserData({
    fill: "rgba(100,100,110,0.9)",
    label: "cannonball",
    lifetime: CANNONBALL_LIFETIME,
    parentCannon: cannon,
  } satisfies CannonballData);
  ball.setBullet(true);

  ball.setLinearVelocity(planck.Vec2(dirX * CANNONBALL_SPEED, dirY * CANNONBALL_SPEED));
  renderer.particles.spawnMuzzleFlash(spawnX, spawnY);
}

let ensureCannonballListener: ((world: planck.World) => void) | null = null;

/**
 * Tick all cannons (fire on cooldown) and cannonball lifetimes.
 * Registers a single contact listener per world for cannonball impact detection.
 */
export function tickCannons(
  world: planck.World,
  renderer: IRenderer,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
  dt: number,
) {
  // Register cannonball contact listener once per world instance
  if (!ensureCannonballListener) {
    ensureCannonballListener = createWorldListener((w) => {
      w.on("begin-contact", (contact) => {
        const fA = contact.getFixtureA().getBody();
        const fB = contact.getFixtureB().getBody();
        let ball: planck.Body | null = null;
        let other: planck.Body | null = null;
        const udA = getBodyUserData(fA);
        const udB = getBodyUserData(fB);
        if (isCannonball(udA) && !udA.exploded) {
          ball = fA;
          other = fB;
        } else if (isCannonball(udB) && !udB.exploded) {
          ball = fB;
          other = fA;
        }
        if (!ball || !other) return;
        const bud = getBodyUserData(ball)! as CannonballData;
        if (other === bud.parentCannon) return;
        bud.exploded = true;
        setTimeout(() => {
          if (bud.destroyed) return;
          explodeAt(
            ball!.getPosition().x,
            ball!.getPosition().y,
            CANNONBALL_EXPLOSION_RADIUS,
            CANNONBALL_EXPLOSION_FORCE,
          );
          markDestroyed(ball!);
          w.destroyBody(ball!);
        }, 0);
      });
    });
  }
  ensureCannonballListener(world);

  // Tick cannon cooldowns and fire
  forEachBodyByLabel(world, isCannon, (b, ud) => {
    ud.cannonCooldown -= dt;
    if (ud.cannonCooldown <= 0) {
      if (!ud.destroyed) fireCannon(world, b, renderer);
      ud.cannonCooldown = CANNON_FIRE_INTERVAL;
    }
  });

  // Tick cannonball lifetimes
  const toDestroy: planck.Body[] = [];
  forEachBodyByLabel(world, isCannonball, (b, ud) => {
    ud.lifetime -= dt;
    if (ud.lifetime <= 0 && !ud.exploded && !ud.destroyed) {
      markDestroyed(b);
      toDestroy.push(b);
    }
  });
  for (const b of toDestroy) {
    world.destroyBody(b);
  }
}
