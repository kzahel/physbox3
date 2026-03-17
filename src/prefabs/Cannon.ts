import * as planck from "planck";
import type { IRenderer } from "../engine/IRenderer";

export function createCannon(
  world: planck.World,
  renderer: IRenderer,
  explodeAt: (wx: number, wy: number, radius: number, force: number) => void,
  x: number,
  y: number,
  angle: number,
): planck.Body {
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
  body.setUserData({ fill: "rgba(80,80,90,0.9)", label: "cannon" });

  const fire = () => {
    const ud = body.getUserData() as { destroyed?: boolean } | null;
    if (ud?.destroyed) return;
    const pos = body.getPosition();
    const a = body.getAngle();
    const dirX = Math.cos(a);
    const dirY = Math.sin(a);

    const spawnX = pos.x + dirX * 1.0;
    const spawnY = pos.y + dirY * 1.0;
    const ball = world.createBody({ type: "dynamic", position: planck.Vec2(spawnX, spawnY) });
    ball.createFixture({ shape: planck.Circle(0.2), density: 5, friction: 0.3, restitution: 0.1 });
    ball.setUserData({ fill: "rgba(100,100,110,0.9)", label: "cannonball" });
    ball.setBullet(true);

    const speed = 20;
    ball.setLinearVelocity(planck.Vec2(dirX * speed, dirY * speed));

    renderer.particles.spawnMuzzleFlash(spawnX, spawnY);

    let exploded = false;
    world.on("begin-contact", (contact) => {
      if (exploded) return;
      const fA = contact.getFixtureA().getBody();
      const fB = contact.getFixtureB().getBody();
      if (fA !== ball && fB !== ball) return;
      if (fA === body || fB === body) return;
      exploded = true;
      setTimeout(() => {
        const bud = ball.getUserData() as { destroyed?: boolean } | null;
        if (bud?.destroyed) return;
        explodeAt(ball.getPosition().x, ball.getPosition().y, 5, 20);
        world.destroyBody(ball);
      }, 0);
    });

    setTimeout(() => {
      const bud = ball.getUserData() as { destroyed?: boolean } | null;
      if (!exploded && !bud?.destroyed) world.destroyBody(ball);
    }, 5000);

    setTimeout(fire, 1000);
  };
  setTimeout(fire, 500);

  return body;
}
