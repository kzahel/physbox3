import * as planck from "planck";

export function createChainRope(world: planck.World, x: number, y: number, links: number, linkLen = 0.4): planck.Body {
  const anchor = world.createBody({ type: "static", position: planck.Vec2(x, y) });
  anchor.createFixture({ shape: planck.Circle(0.15) });

  let prev: planck.Body = anchor;
  for (let i = 0; i < links; i++) {
    const link = world.createBody({
      type: "dynamic",
      position: planck.Vec2(x, y - (i + 1) * linkLen),
      linearDamping: 0.5,
      angularDamping: 2,
    });
    link.createFixture({ shape: planck.Box(0.08, linkLen / 2), density: 2, friction: 0.4 });
    link.setUserData({ fill: "rgba(180,160,120,0.7)" });

    world.createJoint(planck.RevoluteJoint({}, prev, link, planck.Vec2(x, y - i * linkLen - linkLen / 2)));
    prev = link;
  }
  return prev;
}

export function createRopeBetween(
  world: planck.World,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bodyA: planck.Body | null,
  bodyB: planck.Body | null,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const linkLen = 0.4;
  const links = Math.max(2, Math.round(dist / linkLen));
  const stepX = dx / links;
  const stepY = dy / links;
  const angle = Math.atan2(dy, dx) - Math.PI / 2;

  let prev: planck.Body;
  if (bodyA) {
    prev = bodyA;
  } else {
    prev = world.createBody({ type: "static", position: planck.Vec2(x1, y1) });
    prev.createFixture({ shape: planck.Circle(0.15) });
  }

  for (let i = 1; i < links; i++) {
    const lx = x1 + stepX * i;
    const ly = y1 + stepY * i;
    const link = world.createBody({
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
    world.createJoint(planck.RevoluteJoint({}, prev, link, planck.Vec2(jx, jy)));
    prev = link;
  }

  let end: planck.Body;
  if (bodyB) {
    end = bodyB;
  } else {
    end = world.createBody({ type: "static", position: planck.Vec2(x2, y2) });
    end.createFixture({ shape: planck.Circle(0.15) });
  }

  const jx = x1 + stepX * (links - 0.5);
  const jy = y1 + stepY * (links - 0.5);
  world.createJoint(planck.RevoluteJoint({}, prev, end, planck.Vec2(jx, jy)));
}
