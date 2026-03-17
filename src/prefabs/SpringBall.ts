import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { createDistanceJoint, distance } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createSpringBall(pw: PhysWorld, x: number, y: number): Body {
  const sides = 5;
  const radius = 1.5;

  // Hub
  const hub = makeBody(pw, x, y);
  const hubShape = makeShapeDef({ density: 2, friction: 0.4 });
  hub.CreateCircleShape(hubShape, makeCircle(0.3));
  pw.setUserData(hub, { fill: "rgba(255,220,50,0.9)" });

  // Pods
  const pods: Body[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    const pod = makeBody(pw, px, py);
    const podShape = makeShapeDef({ density: 1, friction: 0.6, restitution: 0.5 });
    pod.CreateCircleShape(podShape, makeCircle(0.25));
    pw.setUserData(pod, { fill: "rgba(255,100,180,0.8)" });

    // Spring from hub to pod
    const hubPos = hub.GetPosition();
    const podPos = pod.GetPosition();
    createDistanceJoint(
      pw,
      hub,
      pod,
      { x: hubPos.x, y: hubPos.y },
      { x: podPos.x, y: podPos.y },
      {
        length: radius,
        enableSpring: true,
        hertz: 5,
        dampingRatio: 0.3,
      },
    );

    pods.push(pod);
  }

  // Ring springs between adjacent pods
  for (let i = 0; i < sides; i++) {
    const a = pods[i];
    const b = pods[(i + 1) % sides];
    const aPos = a.GetPosition();
    const bPos = b.GetPosition();
    const edgeLen = distance(aPos, bPos);
    createDistanceJoint(
      pw,
      a,
      b,
      { x: aPos.x, y: aPos.y },
      { x: bPos.x, y: bPos.y },
      {
        length: edgeLen,
        enableSpring: true,
        hertz: 4,
        dampingRatio: 0.4,
      },
    );
  }

  return hub;
}
