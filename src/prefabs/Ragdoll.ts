import * as planck from "planck";

export interface RagdollData {
  torso: planck.Body;
  footContacts: number;
}

export function createRagdoll(world: planck.World, x: number, y: number, ragdolls: RagdollData[]): planck.Body {
  const hue = Math.floor(Math.random() * 360);
  const skinColor = `hsla(${(hue + 30) % 360},40%,70%,0.85)`;
  const shirtColor = `hsla(${hue},60%,45%,0.85)`;
  const pantsColor = `hsla(${(hue + 180) % 360},50%,35%,0.85)`;

  const jointOpts = { lowerAngle: -Math.PI / 3, upperAngle: Math.PI / 3, enableLimit: true };

  const head = world.createBody({ type: "dynamic", position: planck.Vec2(x, y + 2.1) });
  head.createFixture({ shape: planck.Circle(0.25), density: 1, friction: 0.3 });
  head.setUserData({ fill: skinColor, label: "ragdoll" });

  const torso = world.createBody({
    type: "dynamic",
    position: planck.Vec2(x, y + 1.2),
    fixedRotation: true,
  });
  torso.createFixture({ shape: planck.Box(0.25, 0.55), density: 2, friction: 0.3 });
  torso.setUserData({ fill: shirtColor, label: "ragdoll-torso" });

  world.createJoint(
    planck.RevoluteJoint(
      { lowerAngle: -Math.PI / 6, upperAngle: Math.PI / 6, enableLimit: true },
      torso,
      head,
      planck.Vec2(x, y + 1.85),
    ),
  );

  const lArm = world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.55, y + 1.4) });
  lArm.createFixture({ shape: planck.Box(0.08, 0.35), density: 0.5, friction: 0.3 });
  lArm.setUserData({ fill: skinColor, label: "ragdoll" });
  world.createJoint(planck.RevoluteJoint(jointOpts, torso, lArm, planck.Vec2(x - 0.3, y + 1.7)));

  const rArm = world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.55, y + 1.4) });
  rArm.createFixture({ shape: planck.Box(0.08, 0.35), density: 0.5, friction: 0.3 });
  rArm.setUserData({ fill: skinColor, label: "ragdoll" });
  world.createJoint(planck.RevoluteJoint(jointOpts, torso, rArm, planck.Vec2(x + 0.3, y + 1.7)));

  const lULeg = world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.15, y + 0.4) });
  lULeg.createFixture({ shape: planck.Box(0.1, 0.3), density: 1, friction: 0.3 });
  lULeg.setUserData({ fill: pantsColor, label: "ragdoll" });
  world.createJoint(planck.RevoluteJoint(jointOpts, torso, lULeg, planck.Vec2(x - 0.15, y + 0.65)));

  const lFoot = world.createBody({ type: "dynamic", position: planck.Vec2(x - 0.15, y - 0.15) });
  lFoot.createFixture({ shape: planck.Box(0.1, 0.25), density: 1, friction: 0.8 });
  lFoot.setUserData({ fill: pantsColor, label: "ragdoll-foot" });
  world.createJoint(planck.RevoluteJoint(jointOpts, lULeg, lFoot, planck.Vec2(x - 0.15, y + 0.1)));

  const rULeg = world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.15, y + 0.4) });
  rULeg.createFixture({ shape: planck.Box(0.1, 0.3), density: 1, friction: 0.3 });
  rULeg.setUserData({ fill: pantsColor, label: "ragdoll" });
  world.createJoint(planck.RevoluteJoint(jointOpts, torso, rULeg, planck.Vec2(x + 0.15, y + 0.65)));

  const rFoot = world.createBody({ type: "dynamic", position: planck.Vec2(x + 0.15, y - 0.15) });
  rFoot.createFixture({ shape: planck.Box(0.1, 0.25), density: 1, friction: 0.8 });
  rFoot.setUserData({ fill: pantsColor, label: "ragdoll-foot" });
  world.createJoint(planck.RevoluteJoint(jointOpts, rULeg, rFoot, planck.Vec2(x + 0.15, y + 0.1)));

  const ragdoll: RagdollData = { torso, footContacts: 0 };
  ragdolls.push(ragdoll);

  world.on("begin-contact", (contact) => {
    const fA = contact.getFixtureA().getBody();
    const fB = contact.getFixtureB().getBody();
    const feet = [lFoot, rFoot];
    const aIsFoot = feet.includes(fA);
    const bIsFoot = feet.includes(fB);
    if (
      (aIsFoot && fB !== torso && fB !== lULeg && fB !== rULeg) ||
      (bIsFoot && fA !== torso && fA !== lULeg && fA !== rULeg)
    ) {
      ragdoll.footContacts++;
    }
  });
  world.on("end-contact", (contact) => {
    const fA = contact.getFixtureA().getBody();
    const fB = contact.getFixtureB().getBody();
    const feet = [lFoot, rFoot];
    const aIsFoot = feet.includes(fA);
    const bIsFoot = feet.includes(fB);
    if (
      (aIsFoot && fB !== torso && fB !== lULeg && fB !== rULeg) ||
      (bIsFoot && fA !== torso && fA !== lULeg && fA !== rULeg)
    ) {
      ragdoll.footContacts = Math.max(0, ragdoll.footContacts - 1);
    }
  });

  return torso;
}
