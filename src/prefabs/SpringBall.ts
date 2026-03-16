import * as planck from "planck";

export function createSpringBall(world: planck.World, x: number, y: number): planck.Body {
  const sides = 5;
  const radius = 1.5;

  const hub = world.createBody({ type: "dynamic", position: planck.Vec2(x, y) });
  hub.createFixture({ shape: planck.Circle(0.3), density: 2, friction: 0.4 });
  hub.setUserData({ fill: "rgba(255,220,50,0.9)" });

  const pods: planck.Body[] = [];
  for (let i = 0; i < sides; i++) {
    const angle = (i * 2 * Math.PI) / sides - Math.PI / 2;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;

    const pod = world.createBody({ type: "dynamic", position: planck.Vec2(px, py) });
    pod.createFixture({ shape: planck.Circle(0.25), density: 1, friction: 0.6, restitution: 0.5 });
    pod.setUserData({ fill: "rgba(255,100,180,0.8)" });

    world.createJoint(
      planck.DistanceJoint(
        { frequencyHz: 5, dampingRatio: 0.3, length: radius },
        hub,
        pod,
        hub.getPosition(),
        pod.getPosition(),
      ),
    );

    pods.push(pod);
  }

  for (let i = 0; i < sides; i++) {
    const a = pods[i];
    const b = pods[(i + 1) % sides];
    const edgeLen = planck.Vec2.lengthOf(planck.Vec2.sub(a.getPosition(), b.getPosition()));
    world.createJoint(
      planck.DistanceJoint(
        { frequencyHz: 4, dampingRatio: 0.4, length: edgeLen },
        a,
        b,
        a.getPosition(),
        b.getPosition(),
      ),
    );
  }

  return hub;
}
