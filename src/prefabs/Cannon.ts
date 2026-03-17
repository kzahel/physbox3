import type { Body } from "box2d3";
import { type CannonballData, type CannonData, isCannon, isCannonball } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { IRenderer } from "../engine/IRenderer";
import { bodyAngle, forEachBodyByLabel, markDestroyed } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

const CANNON_FIRE_INTERVAL = 1;
const CANNONBALL_SPEED = 20;
const CANNONBALL_LIFETIME = 5;
const CANNONBALL_EXPLOSION_RADIUS = 5;
const CANNONBALL_EXPLOSION_FORCE = 20;

export function createCannon(pw: PhysWorld, x: number, y: number, angle: number): Body {
  const B2 = b2();
  const bodyDef = B2.b2DefaultBodyDef();
  bodyDef.type = B2.b2BodyType.b2_staticBody;
  bodyDef.position = new B2.b2Vec2(x, y);
  bodyDef.rotation = B2.b2MakeRot(angle);
  const body = pw.createBody(bodyDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.material.friction = 0.5;
  body.CreatePolygonShape(shapeDef, B2.b2MakeBox(0.6, 0.3));

  // Barrel
  const barrelHull = B2.b2ComputeHull([
    new B2.b2Vec2(0.4, -0.35),
    new B2.b2Vec2(0.8, -0.35),
    new B2.b2Vec2(0.8, 0.35),
    new B2.b2Vec2(0.4, 0.35),
  ]);
  body.CreatePolygonShape(shapeDef, B2.b2MakePolygon(barrelHull, 0));

  pw.setUserData(body, { fill: "rgba(80,80,90,0.9)", label: "cannon", cannonCooldown: 0.5 } satisfies CannonData);
  return body;
}

function fireCannon(pw: PhysWorld, cannon: Body, renderer: IRenderer) {
  const B2 = b2();
  const pos = cannon.GetPosition();
  const a = bodyAngle(cannon);
  const dirX = Math.cos(a);
  const dirY = Math.sin(a);

  const spawnX = pos.x + dirX * 1.0;
  const spawnY = pos.y + dirY * 1.0;

  const ballDef = B2.b2DefaultBodyDef();
  ballDef.type = B2.b2BodyType.b2_dynamicBody;
  ballDef.position = new B2.b2Vec2(spawnX, spawnY);
  ballDef.isBullet = true;
  ballDef.linearVelocity = new B2.b2Vec2(dirX * CANNONBALL_SPEED, dirY * CANNONBALL_SPEED);
  const ball = pw.createBody(ballDef);

  const shapeDef = B2.b2DefaultShapeDef();
  shapeDef.density = 5;
  shapeDef.material.friction = 0.3;
  shapeDef.material.restitution = 0.1;
  shapeDef.enableHitEvents = true;
  shapeDef.enableContactEvents = true;
  const circle = new B2.b2Circle();
  circle.center = new B2.b2Vec2(0, 0);
  circle.radius = 0.2;
  ball.CreateCircleShape(shapeDef, circle);

  pw.setUserData(ball, {
    fill: "rgba(100,100,110,0.9)",
    label: "cannonball",
    lifetime: CANNONBALL_LIFETIME,
    parentCannon: cannon,
  } satisfies CannonballData);

  renderer.particles.spawnMuzzleFlash(spawnX, spawnY);
}

/**
 * Tick all cannons (fire on cooldown) and cannonball lifetimes.
 * Cannonball impact detection uses polled contact data instead of listeners.
 */
export function tickCannons(
  pw: PhysWorld,
  renderer: IRenderer,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
  dt: number,
) {
  const B2 = b2();

  // Tick cannon cooldowns and fire
  forEachBodyByLabel(pw, isCannon, (b, ud) => {
    ud.cannonCooldown -= dt;
    if (ud.cannonCooldown <= 0) {
      if (!ud.destroyed) fireCannon(pw, b, renderer);
      ud.cannonCooldown = CANNON_FIRE_INTERVAL;
    }
  });

  // Tick cannonball lifetimes and detect impacts via contact data
  const toDestroy: Body[] = [];
  forEachBodyByLabel(pw, isCannonball, (b, ud) => {
    ud.lifetime -= dt;

    // Check for impact: poll contact data on the cannonball
    if (!ud.exploded && !ud.destroyed) {
      const contacts = b.GetContactData();
      for (let i = 0; i < contacts.length; i++) {
        const contact = contacts[i];
        // Get the other body from contact shapes
        const bodyIdA = B2.b2Shape_GetBody(contact.shapeIdA);
        const bodyIdB = B2.b2Shape_GetBody(contact.shapeIdB);
        const ballPtr = b.GetPointer();

        // Determine which body ID is the "other"
        const otherBodyId = B2.B2_ID_EQUALS(bodyIdA, ballPtr) ? bodyIdB : bodyIdA;

        // Skip if contacting parent cannon
        if (ud.parentCannon?.IsValid() && B2.B2_ID_EQUALS(otherBodyId, ud.parentCannon.GetPointer())) {
          continue;
        }

        // Impact! Trigger explosion
        ud.exploded = true;
        const pos = b.GetPosition();
        explodeAt(pos.x, pos.y, CANNONBALL_EXPLOSION_RADIUS, CANNONBALL_EXPLOSION_FORCE);
        markDestroyed(pw, b);
        toDestroy.push(b);
        break;
      }
    }

    // Auto-despawn after lifetime expires
    if (ud.lifetime <= 0 && !ud.exploded && !ud.destroyed) {
      markDestroyed(pw, b);
      toDestroy.push(b);
    }
  });

  for (const b of toDestroy) {
    pw.destroyBody(b);
  }
}
