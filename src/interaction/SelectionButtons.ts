import type { Body } from "box2d3";
import { getBodyUserData, isConveyor, isRocket } from "../engine/BodyUserData";
import { b2 } from "../engine/Box2D";
import type { PhysWorld } from "../engine/PhysWorld";

/** Button dimensions */
export const BTN_HALF_WIDTH = 38;
export const BTN_HALF_HEIGHT = 9;

const BTN_TOGGLE_OFFSET_Y = 30;
const BTN_DIRECTION_OFFSET_Y = 55;
const BTN_SPACING = 25;

export interface SelectionButton {
  id: "toggle" | "direction" | "motor";
  /** Screen-space Y offset from body center (negative = above) */
  offsetY: number;
}

export function isDirectional(pw: PhysWorld, body: Body): boolean {
  const label = getBodyLabel(pw, body);
  return label === "car" || label === "train" || label === "conveyor" || label === "rocket" || hasMotor(pw, body);
}

export function hasMotor(pw: PhysWorld, body: Body): boolean {
  const ud = getBodyUserData(pw, body);
  return ud != null && ud.motorSpeed != null;
}

export function getBodyLabel(pw: PhysWorld, body: Body): string | undefined {
  return getBodyUserData(pw, body)?.label;
}

/** Returns the selection buttons that should be shown for a body, in order. */
export function getSelectionButtons(pw: PhysWorld, body: Body): SelectionButton[] {
  const buttons: SelectionButton[] = [{ id: "toggle", offsetY: BTN_TOGGLE_OFFSET_Y }];
  let nextY = BTN_DIRECTION_OFFSET_Y;
  if (isDirectional(pw, body)) {
    buttons.push({ id: "direction", offsetY: nextY });
    nextY += BTN_SPACING;
  }
  buttons.push({ id: "motor", offsetY: nextY });
  return buttons;
}

export function hitButton(sx: number, sy: number, cx: number, cy: number): boolean {
  return Math.abs(sx - cx) < BTN_HALF_WIDTH && Math.abs(sy - cy) < BTN_HALF_HEIGHT;
}

/** Execute the action for a button */
export function executeButtonAction(id: SelectionButton["id"], pw: PhysWorld, body: Body) {
  const B2 = b2();
  switch (id) {
    case "toggle": {
      const isStatic = body.GetType().value === B2.b2BodyType.b2_staticBody.value;
      body.SetType(isStatic ? B2.b2BodyType.b2_dynamicBody : B2.b2BodyType.b2_staticBody);
      break;
    }
    case "direction":
      reverseDirection(pw, body);
      break;
    case "motor":
      toggleMotor(pw, body);
      break;
  }
}

function reverseDirection(pw: PhysWorld, body: Body) {
  const B2 = b2();
  const label = getBodyLabel(pw, body);
  if (label === "car" || label === "train") {
    // Reverse wheel joint motors — iterate joints tracked by PhysWorld
    pw.forEachJoint((joint) => {
      if (joint.GetType().value !== B2.b2JointType.b2_wheelJoint.value) return;
      const bodyA = joint.GetBodyA();
      const bodyB = joint.GetBodyB();
      if (bodyA === body || bodyB === body) {
        // biome-ignore lint/suspicious/noExplicitAny: WheelJoint methods not fully typed
        const wj = joint as any;
        if (typeof wj.SetMotorSpeed === "function" && typeof wj.GetMotorSpeed === "function") {
          wj.SetMotorSpeed(-wj.GetMotorSpeed());
        }
      }
    });
  } else if (label === "conveyor") {
    const ud = getBodyUserData(pw, body);
    if (isConveyor(ud)) ud.speed = -ud.speed;
  } else if (label === "rocket") {
    const ud = getBodyUserData(pw, body);
    if (isRocket(ud)) ud.thrust = -ud.thrust;
  }
  const mud = getBodyUserData(pw, body);
  if (mud && mud.motorSpeed != null) mud.motorSpeed = -mud.motorSpeed;
}

function toggleMotor(pw: PhysWorld, body: Body) {
  const B2 = b2();
  const ud = getBodyUserData(pw, body);
  if (ud && ud.motorSpeed != null) {
    delete ud.motorSpeed;
  } else {
    const isStatic = body.GetType().value === B2.b2BodyType.b2_staticBody.value;
    if (isStatic) body.SetType(B2.b2BodyType.b2_dynamicBody);
    const data = ud ?? {};
    data.motorSpeed = 5;
    pw.setUserData(body, data);
    body.SetAwake(true);
  }
}
