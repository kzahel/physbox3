import * as planck from "planck";

export function createLauncher(world: planck.World, x: number, y: number): planck.Body {
  const base = world.createBody({ type: "static", position: planck.Vec2(x, y) });
  base.createFixture({ shape: planck.Box(1.5, 0.3), friction: 0.5 });
  base.setUserData({ fill: "rgba(100,100,120,0.9)" });

  const rod = world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 1.5) });
  rod.createFixture({ shape: planck.Box(0.15, 1), density: 0.5, friction: 0.2 });
  rod.setUserData({ fill: "rgba(160,160,180,0.8)" });

  const plat = world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 2.8) });
  plat.createFixture({ shape: planck.Box(2, 0.2), density: 1, friction: 0.7 });
  plat.setUserData({ fill: "rgba(80,180,80,0.8)" });

  world.createJoint(planck.WeldJoint({}, rod, plat, planck.Vec2(x, y + 2.5)));

  const piston = world.createJoint(
    planck.PrismaticJoint(
      {
        enableLimit: true,
        lowerTranslation: 0,
        upperTranslation: 3,
        enableMotor: true,
        maxMotorForce: 200,
        motorSpeed: 5,
      },
      base,
      rod,
      planck.Vec2(x, y),
      planck.Vec2(0, 1),
    ),
  ) as planck.PrismaticJoint;

  const oscillate = () => {
    if (!piston.isActive()) return;
    const t = piston.getJointTranslation();
    const upper = 3;
    if (t >= upper * 0.95) piston.setMotorSpeed(-8);
    else if (t <= 0.05) piston.setMotorSpeed(5);
    requestAnimationFrame(oscillate);
  };
  requestAnimationFrame(oscillate);

  return plat;
}
