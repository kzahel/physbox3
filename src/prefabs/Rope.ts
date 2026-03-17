import * as planck from "planck";
import { clamp } from "../engine/Physics";

// Rope link physics
const MAX_ROPE_LINKS = 30;
const LINK_HALF_WIDTH = 0.08;
const LINK_DENSITY = 2;
const LINK_FRICTION = 0.4;
const LINK_LINEAR_DAMPING = 0.5;
const LINK_ANGULAR_DAMPING = 2;
const LINK_COLOR = "rgba(180,160,120,0.7)";
const ANCHOR_RADIUS = 0.15;

// Stabilizer spring parameters
const STABILIZER_SLACK = 1.15;
const STABILIZER_SPRING_K = 50;
const STABILIZER_DAMPING = 5;

export function createChainRope(world: planck.World, x: number, y: number, links: number, linkLen = 0.4): planck.Body {
  const anchor = world.createBody({ type: "static", position: planck.Vec2(x, y) });
  anchor.createFixture({ shape: planck.Circle(ANCHOR_RADIUS) });

  let prev: planck.Body = anchor;
  for (let i = 0; i < links; i++) {
    const link = world.createBody({
      type: "dynamic",
      position: planck.Vec2(x, y - (i + 1) * linkLen),
      linearDamping: LINK_LINEAR_DAMPING,
      angularDamping: LINK_ANGULAR_DAMPING,
    });
    link.createFixture({
      shape: planck.Box(LINK_HALF_WIDTH, linkLen / 2),
      density: LINK_DENSITY,
      friction: LINK_FRICTION,
    });
    link.setUserData({ fill: LINK_COLOR, label: "ropeLink" });

    world.createJoint(
      planck.RevoluteJoint({ collideConnected: true }, prev, link, planck.Vec2(x, y - i * linkLen - linkLen / 2)),
    );
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
  linkCount?: number,
): void {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const links = linkCount ?? clamp(Math.round(dist / 0.4), 2, MAX_ROPE_LINKS);
  const linkLen = dist / links;
  const stepX = dx / links;
  const stepY = dy / links;
  const angle = Math.atan2(dy, dx) - Math.PI / 2;

  let prev: planck.Body;
  let anchorA: planck.Body | null = null;
  if (bodyA) {
    prev = bodyA;
  } else {
    anchorA = world.createBody({ type: "static", position: planck.Vec2(x1, y1) });
    anchorA.createFixture({ shape: planck.Circle(ANCHOR_RADIUS) });
    anchorA.setUserData({ label: "ropeAnchor" });
    prev = anchorA;
  }

  const chainLinks: planck.Body[] = [];
  for (let i = 1; i < links; i++) {
    const lx = x1 + stepX * i;
    const ly = y1 + stepY * i;
    const link = world.createBody({
      type: "dynamic",
      position: planck.Vec2(lx, ly),
      angle,
      linearDamping: LINK_LINEAR_DAMPING,
      angularDamping: LINK_ANGULAR_DAMPING,
    });
    link.createFixture({
      shape: planck.Box(LINK_HALF_WIDTH, linkLen / 2),
      density: LINK_DENSITY,
      friction: LINK_FRICTION,
    });
    link.setUserData({ fill: LINK_COLOR, label: "ropeLink" });

    const jx = x1 + stepX * (i - 0.5);
    const jy = y1 + stepY * (i - 0.5);
    world.createJoint(planck.RevoluteJoint({ collideConnected: true }, prev, link, planck.Vec2(jx, jy)));
    chainLinks.push(link);
    prev = link;
  }

  let end: planck.Body;
  if (bodyB) {
    end = bodyB;
  } else {
    end = world.createBody({ type: "static", position: planck.Vec2(x2, y2) });
    end.createFixture({ shape: planck.Circle(ANCHOR_RADIUS) });
    end.setUserData({ label: "ropeAnchor" });
  }

  const jx = x1 + stepX * (links - 0.5);
  const jy = y1 + stepY * (links - 0.5);
  world.createJoint(planck.RevoluteJoint({ collideConnected: true }, prev, end, planck.Vec2(jx, jy)));

  // Add a RopeJoint between endpoints to enforce max distance as a single efficient constraint
  const first = bodyA ?? anchorA!;
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
        userData: { ropeStabilizer: true, isMainRope: true, restLength: dist, chainBodies: [...chainLinks] },
      } as planck.RopeJointDef),
    );

    // Add midpoint (and quarter-point for longer ropes) stabilizer joints.
    // These constrain sub-spans of the rope so the middle can't stretch freely.
    // The slack factor allows natural catenary sag before the spring engages.
    const SLACK = STABILIZER_SLACK;
    if (chainLinks.length < 8) return; // short ropes don't need interior stabilizers
    const interiorPoints = chainLinks.length >= 16 ? [0.25, 0.5, 0.75] : [0.5];
    for (const frac of interiorPoints) {
      const idx = Math.floor((chainLinks.length - 1) * frac);
      const mid = chainLinks[idx];
      if (!mid) continue;

      // The sub-chain of bodies this stabilizer depends on
      const subChainA = chainLinks.slice(0, idx + 1);
      const subChainB = chainLinks.slice(idx);

      // Joint from first endpoint to this interior point
      if (first !== mid && (first.isDynamic() || mid.isDynamic())) {
        world.createJoint(
          new planck.RopeJoint({
            bodyA: first,
            bodyB: mid,
            localAnchorA: localA,
            localAnchorB: planck.Vec2(0, 0),
            maxLength: dist * frac * SLACK,
            collideConnected: true,
            userData: { ropeStabilizer: true, restLength: dist * frac * SLACK, chainBodies: subChainA },
          } as planck.RopeJointDef),
        );
      }

      // Joint from this interior point to last endpoint
      if (last !== mid && (last.isDynamic() || mid.isDynamic())) {
        world.createJoint(
          new planck.RopeJoint({
            bodyA: mid,
            bodyB: last,
            localAnchorA: planck.Vec2(0, 0),
            localAnchorB: localB,
            maxLength: dist * (1 - frac) * SLACK,
            collideConnected: true,
            userData: { ropeStabilizer: true, restLength: dist * (1 - frac) * SLACK, chainBodies: subChainB },
          } as planck.RopeJointDef),
        );
      }
    }
  }
}

/**
 * Apply a soft spring force to rope endpoints that have stretched beyond their rest length.
 * This supplements the constraint solver by providing a smooth restoring force gradient.
 */
export function applyRopeStabilization(world: planck.World) {
  const SPRING_K = STABILIZER_SPRING_K;
  const DAMPING = STABILIZER_DAMPING;
  const toDestroy: planck.Joint[] = [];

  for (let j = world.getJointList(); j; j = j.getNext()) {
    const ud = j.getUserData() as { ropeStabilizer?: boolean; restLength?: number; chainBodies?: planck.Body[] } | null;
    if (!ud?.ropeStabilizer) continue;

    // If any body in the dependent chain has been destroyed, remove this stabilizer
    if (ud.chainBodies?.some((b) => (b.getUserData() as Record<string, unknown>)?.destroyed)) {
      toDestroy.push(j);
      continue;
    }

    const bodyA = j.getBodyA();
    const bodyB = j.getBodyB();
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal Planck.js property
    const anchorA = bodyA.getWorldPoint((j as any).m_localAnchorA);
    // biome-ignore lint/suspicious/noExplicitAny: accessing internal Planck.js property
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

  for (const j of toDestroy) world.destroyJoint(j);
}
