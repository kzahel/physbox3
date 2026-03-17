import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import { clamp, createDistanceJoint, createRevoluteJoint, isDynamic } from "../engine/Physics";
import type { JointHandle, PhysWorld } from "../engine/PhysWorld";

// Rope link physics
const MAX_ROPE_LINKS = 30;
const LINK_HALF_WIDTH = 0.08;
const LINK_DENSITY = 2;
const LINK_FRICTION = 0.4;
const LINK_LINEAR_DAMPING = 0.5;
const LINK_ANGULAR_DAMPING = 2;
const LINK_COLOR = "rgba(180,160,120,0.7)";
const ANCHOR_RADIUS = 0.15;

// Stabilizer spring parameters (disabled — Box2D v3 solver is stable enough without it)
const ENABLE_ROPE_STABILIZER = false;
const STABILIZER_SPRING_K = 50;
const STABILIZER_DAMPING = 5;

function createRopeAnchor(pw: PhysWorld, x: number, y: number, label?: string): Body {
  const anchor = makeBody(pw, x, y, { type: "static" });
  const shape = makeShapeDef({ hitEvents: false });
  anchor.CreateCircleShape(shape, makeCircle(ANCHOR_RADIUS));
  if (label) pw.setUserData(anchor, { label });
  return anchor;
}

function createRopeLink(pw: PhysWorld, x: number, y: number, linkLen: number, rotation?: number): Body {
  const link = makeBody(pw, x, y, {
    linearDamping: LINK_LINEAR_DAMPING,
    angularDamping: LINK_ANGULAR_DAMPING,
    rotation,
  });
  const linkShape = makeShapeDef({ density: LINK_DENSITY, friction: LINK_FRICTION });
  link.CreatePolygonShape(linkShape, b2().b2MakeBox(LINK_HALF_WIDTH, linkLen / 2));
  pw.setUserData(link, { fill: LINK_COLOR, label: "ropeLink" });
  return link;
}

export function createChainRope(pw: PhysWorld, x: number, y: number, links: number, linkLen = 0.4): Body {
  const anchor = createRopeAnchor(pw, x, y);

  let prev: Body = anchor;
  for (let i = 0; i < links; i++) {
    const link = createRopeLink(pw, x, y - (i + 1) * linkLen, linkLen);
    createRevoluteJoint(pw, prev, link, { x, y: y - i * linkLen - linkLen / 2 }, { collideConnected: true });
    prev = link;
  }
  return prev;
}

export function createRopeBetween(
  pw: PhysWorld,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  bodyA: Body | null,
  bodyB: Body | null,
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

  let prev: Body;
  let anchorA: Body | null = null;
  if (bodyA) {
    prev = bodyA;
  } else {
    anchorA = createRopeAnchor(pw, x1, y1, "ropeAnchor");
    prev = anchorA;
  }

  const chainLinks: Body[] = [];
  for (let i = 1; i < links; i++) {
    const lx = x1 + stepX * i;
    const ly = y1 + stepY * i;
    const link = createRopeLink(pw, lx, ly, linkLen, angle);

    const jx = x1 + stepX * (i - 0.5);
    const jy = y1 + stepY * (i - 0.5);
    createRevoluteJoint(pw, prev, link, { x: jx, y: jy }, { collideConnected: true });
    chainLinks.push(link);
    prev = link;
  }

  let end: Body;
  if (bodyB) {
    end = bodyB;
  } else {
    end = createRopeAnchor(pw, x2, y2, "ropeAnchor");
  }

  const jx = x1 + stepX * (links - 0.5);
  const jy = y1 + stepY * (links - 0.5);
  createRevoluteJoint(pw, prev, end, { x: jx, y: jy }, { collideConnected: true });

  // Distance joint between endpoints to enforce max distance (replaces RopeJoint).
  // Soft spring at slack length + hard max limit. The spring rest length is 20% beyond
  // the rope chain so it never pulls bodies together when the rope is merely sagging.
  const first = bodyA ?? anchorA!;
  const last = bodyB ?? end;
  if (ENABLE_ROPE_STABILIZER && first !== last && (isDynamic(first) || isDynamic(last))) {
    const anchor1 = { x: x1, y: y1 };
    const anchor2 = { x: x2, y: y2 };

    const slack = dist * 1.2;
    const mainJoint = createDistanceJoint(pw, first, last, anchor1, anchor2, {
      length: slack,
      enableSpring: true,
      hertz: 0.5,
      dampingRatio: 1,
      enableLimit: true,
      minLength: 0,
      maxLength: slack,
      collideConnected: true,
    });
    pw.setJointData(mainJoint, {
      ropeStabilizer: true,
      isMainRope: true,
      restLength: slack,
      chainBodies: [...chainLinks],
    });
  }
}

/**
 * Apply a soft spring force to rope endpoints that have stretched beyond their rest length.
 * This supplements the constraint solver by providing a smooth restoring force gradient.
 */
export function applyRopeStabilization(pw: PhysWorld) {
  if (!ENABLE_ROPE_STABILIZER) return;
  const B2 = b2();
  const SPRING_K = STABILIZER_SPRING_K;
  const DAMP = STABILIZER_DAMPING;
  const toDestroy: JointHandle[] = [];

  pw.forEachJoint((j) => {
    const ud = pw.getJointData(j) as { ropeStabilizer?: boolean; restLength?: number; chainBodies?: Body[] } | null;
    if (!ud?.ropeStabilizer) return;

    // If any body in the dependent chain has been destroyed, remove this stabilizer
    if (ud.chainBodies?.some((b) => !b.IsValid() || pw.getUserData(b)?.destroyed)) {
      toDestroy.push(j);
      return;
    }

    const bodyA = j.GetBodyA();
    const bodyB = j.GetBodyB();
    const frameA = j.GetLocalFrameA();
    const frameB = j.GetLocalFrameB();
    const anchorA = bodyA.GetWorldPoint(frameA.p);
    const anchorB = bodyB.GetWorldPoint(frameB.p);

    const ddx = anchorB.x - anchorA.x;
    const ddy = anchorB.y - anchorA.y;
    const currentLen = Math.hypot(ddx, ddy);
    const restLen = ud.restLength!;

    if (currentLen <= restLen || currentLen < 0.01) return;

    const dirX = ddx / currentLen;
    const dirY = ddy / currentLen;
    const stretch = currentLen - restLen;
    const forceMag = SPRING_K * stretch;

    // Velocity damping along rope axis
    const velA = bodyA.GetLinearVelocity();
    const velB = bodyB.GetLinearVelocity();
    const relVelX = velB.x - velA.x;
    const relVelY = velB.y - velA.y;
    const velAlongRope = relVelX * dirX + relVelY * dirY;
    const dampingForce = DAMP * velAlongRope;

    const totalForce = forceMag + dampingForce;
    const forceVec = new B2.b2Vec2(totalForce * dirX, totalForce * dirY);
    const negForce = new B2.b2Vec2(-totalForce * dirX, -totalForce * dirY);

    if (isDynamic(bodyA)) bodyA.ApplyForce(forceVec, anchorA, true);
    if (isDynamic(bodyB)) bodyB.ApplyForce(negForce, anchorB, true);
  });

  for (const j of toDestroy) pw.destroyJoint(j);
}
