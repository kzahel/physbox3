import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import { createDistanceJoint, distance } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export function createSpringBall(pw: PhysWorld, x: number, y: number): Body {
  const B2 = b2();
  const sides = 5;
  const radius = 1.5;

  // Hub
  const hubDef = B2.b2DefaultBodyDef();
  hubDef.type = B2.b2BodyType.b2_dynamicBody;
  hubDef.position = new B2.b2Vec2(x, y);
  const hub = pw.createBody(hubDef);

  const hubShape = B2.b2DefaultShapeDef();
  hubShape.density = 2;
  hubShape.material.friction = 0.4;
  hubShape.enableHitEvents = true;
  const hubCircle = new B2.b2Circle();
  hubCircle.center = new B2.b2Vec2(0, 0);
  hubCircle.radius = 0.3;
  hub.CreateCircleShape(hubShape, hubCircle);
  pw.setUserData(hub, { fill: "rgba(255,220,50,0.9)" });

  // Pods
  const pods: Body[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    const podDef = B2.b2DefaultBodyDef();
    podDef.type = B2.b2BodyType.b2_dynamicBody;
    podDef.position = new B2.b2Vec2(px, py);
    const pod = pw.createBody(podDef);

    const podShape = B2.b2DefaultShapeDef();
    podShape.density = 1;
    podShape.material.friction = 0.6;
    podShape.material.restitution = 0.5;
    podShape.enableHitEvents = true;
    const podCircle = new B2.b2Circle();
    podCircle.center = new B2.b2Vec2(0, 0);
    podCircle.radius = 0.25;
    pod.CreateCircleShape(podShape, podCircle);
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
