import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { b2 } from "../engine/Box2D";
import { createRevoluteJoint } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

export interface RagdollData {
  torso: Body;
  /** Foot contact count. In box2d3 this is computed by polling GetContactCapacity. */
  footContacts: number;
  feet: Body[];
  /** Bodies that are part of this ragdoll (foot contacts with these don't count). */
  innerBodies: Body[];
}

/** Compute the current foot-ground contact count by polling contact data. */
export function updateRagdollFootContacts(pw: PhysWorld, ragdoll: RagdollData): void {
  let count = 0;
  const innerSet = new Set(ragdoll.innerBodies);
  const B2 = b2();

  for (const foot of ragdoll.feet) {
    if (!foot.IsValid()) continue;
    const contacts = foot.GetContactData();
    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i];
      const bodyIdA = B2.b2Shape_GetBody(contact.shapeIdA);
      const bodyIdB = B2.b2Shape_GetBody(contact.shapeIdB);
      // Check if the other body is not part of this ragdoll
      let otherIsInner = false;
      for (const inner of innerSet) {
        if (!inner.IsValid()) continue;
        const innerId = pw.getBodyId(inner);
        if (B2.B2_ID_EQUALS(bodyIdA, innerId) || B2.B2_ID_EQUALS(bodyIdB, innerId)) {
          otherIsInner = true;
          break;
        }
      }
      if (!otherIsInner) count++;
    }
  }
  ragdoll.footContacts = count;
}

export function createRagdoll(pw: PhysWorld, x: number, y: number, ragdolls: RagdollData[]): Body {
  const hue = Math.floor(Math.random() * 360);
  const skinColor = `hsla(${(hue + 30) % 360},40%,70%,0.85)`;
  const shirtColor = `hsla(${hue},60%,45%,0.85)`;
  const pantsColor = `hsla(${(hue + 180) % 360},50%,35%,0.85)`;

  const limbOpts = { enableLimit: true, lowerAngle: -Math.PI / 3, upperAngle: Math.PI / 3 };
  const neckOpts = { enableLimit: true, lowerAngle: -Math.PI / 6, upperAngle: Math.PI / 6 };

  function addCircle(body: Body, radius: number, density: number, friction: number) {
    body.CreateCircleShape(makeShapeDef({ density, friction }), makeCircle(radius));
  }

  function addBox(body: Body, hw: number, hh: number, density: number, friction: number) {
    body.CreatePolygonShape(makeShapeDef({ density, friction }), b2().b2MakeBox(hw, hh));
  }

  // Head
  const head = makeBody(pw, x, y + 2.1);
  addCircle(head, 0.25, 1, 0.3);
  pw.setUserData(head, { fill: skinColor, label: "ragdoll" });

  // Torso (fixed rotation)
  const torso = makeBody(pw, x, y + 1.2, { fixedRotation: true });
  addBox(torso, 0.25, 0.55, 2, 0.3);
  pw.setUserData(torso, { fill: shirtColor, label: "ragdoll-torso" });

  createRevoluteJoint(pw, torso, head, { x, y: y + 1.85 }, neckOpts);

  // Arms
  const lArm = makeBody(pw, x - 0.55, y + 1.4);
  addBox(lArm, 0.08, 0.35, 0.5, 0.3);
  pw.setUserData(lArm, { fill: skinColor, label: "ragdoll" });
  createRevoluteJoint(pw, torso, lArm, { x: x - 0.3, y: y + 1.7 }, limbOpts);

  const rArm = makeBody(pw, x + 0.55, y + 1.4);
  addBox(rArm, 0.08, 0.35, 0.5, 0.3);
  pw.setUserData(rArm, { fill: skinColor, label: "ragdoll" });
  createRevoluteJoint(pw, torso, rArm, { x: x + 0.3, y: y + 1.7 }, limbOpts);

  // Upper legs
  const lULeg = makeBody(pw, x - 0.15, y + 0.4);
  addBox(lULeg, 0.1, 0.3, 1, 0.3);
  pw.setUserData(lULeg, { fill: pantsColor, label: "ragdoll" });
  createRevoluteJoint(pw, torso, lULeg, { x: x - 0.15, y: y + 0.65 }, limbOpts);

  const rULeg = makeBody(pw, x + 0.15, y + 0.4);
  addBox(rULeg, 0.1, 0.3, 1, 0.3);
  pw.setUserData(rULeg, { fill: pantsColor, label: "ragdoll" });
  createRevoluteJoint(pw, torso, rULeg, { x: x + 0.15, y: y + 0.65 }, limbOpts);

  // Feet
  const lFoot = makeBody(pw, x - 0.15, y - 0.15);
  addBox(lFoot, 0.1, 0.25, 1, 0.8);
  pw.setUserData(lFoot, { fill: pantsColor, label: "ragdoll-foot" });
  createRevoluteJoint(pw, lULeg, lFoot, { x: x - 0.15, y: y + 0.1 }, limbOpts);

  const rFoot = makeBody(pw, x + 0.15, y - 0.15);
  addBox(rFoot, 0.1, 0.25, 1, 0.8);
  pw.setUserData(rFoot, { fill: pantsColor, label: "ragdoll-foot" });
  createRevoluteJoint(pw, rULeg, rFoot, { x: x + 0.15, y: y + 0.1 }, limbOpts);

  const ragdoll: RagdollData = {
    torso,
    footContacts: 0,
    feet: [lFoot, rFoot],
    innerBodies: [head, torso, lArm, rArm, lULeg, rULeg, lFoot, rFoot],
  };
  ragdolls.push(ragdoll);

  return torso;
}
