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

    world.createJoint(planck.RevoluteJoint({ collideConnected: true }, prev, link, planck.Vec2(x, y - i * linkLen - linkLen / 2)));
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
  const MAX_LINKS = 30;
  const links = Math.max(2, Math.min(MAX_LINKS, Math.round(dist / 0.4)));
  const linkLen = dist / links;
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
    world.createJoint(planck.RevoluteJoint({ collideConnected: true }, prev, link, planck.Vec2(jx, jy)));
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
  world.createJoint(planck.RevoluteJoint({ collideConnected: true }, prev, end, planck.Vec2(jx, jy)));

  // Add a RopeJoint between endpoints to enforce max distance as a single efficient constraint
  const first = bodyA ?? world.getBodyList()!;
  const last = bodyB ?? end;
  if (first !== last && (first.isDynamic() || last.isDynamic())) {
    const localA = first.getLocalPoint(planck.Vec2(x1, y1));
    const localB = last.getLocalPoint(planck.Vec2(x2, y2));
    world.createJoint(
      new planck.RopeJoint({
        bodyA: first,
        bodyB: last,
        localAnchorA: localA,
        localAnchorB: localB,
        maxLength: dist,
        collideConnected: true,
        userData: { ropeStabilizer: true, restLength: dist },
      } as planck.RopeJointDef),
    );
  }
}

/**
 * Apply a soft spring force to rope endpoints that have stretched beyond their rest length.
 * This supplements the constraint solver by providing a smooth restoring force gradient.
 */
export function applyRopeStabilization(world: planck.World) {
  const SPRING_K = 50; // spring stiffness
  const DAMPING = 5; // velocity damping along rope axis

  for (let j = world.getJointList(); j; j = j.getNext()) {
    const ud = j.getUserData() as { ropeStabilizer?: boolean; restLength?: number } | null;
    if (!ud?.ropeStabilizer) continue;

    const bodyA = j.getBodyA();
    const bodyB = j.getBodyB();
    const anchorA = bodyA.getWorldPoint((j as any).m_localAnchorA);
    const anchorB = bodyB.getWorldPoint((j as any).m_localAnchorB);
    const d = planck.Vec2.sub(anchorB, anchorA);
    const currentLen = planck.Vec2.lengthOf(d);
    const restLen = ud.restLength!;

    if (currentLen <= restLen || currentLen < 0.01) continue;

    // Unit direction from A to B
    const dir = planck.Vec2.mul(1 / currentLen, d);
    const stretch = currentLen - restLen;

    // Spring force proportional to stretch
    const forceMag = SPRING_K * stretch;

    // Velocity damping along rope axis
    const relVel = planck.Vec2.sub(bodyB.getLinearVelocity(), bodyA.getLinearVelocity());
    const velAlongRope = planck.Vec2.dot(relVel, dir);
    const dampingForce = DAMPING * velAlongRope;

    const totalForce = forceMag + dampingForce;
    const force = planck.Vec2.mul(totalForce, dir);

    if (bodyA.isDynamic()) bodyA.applyForce(force, anchorA, true);
    if (bodyB.isDynamic()) bodyB.applyForce(planck.Vec2.mul(-1, force), anchorB, true);
  }
}
