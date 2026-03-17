import type * as planck from "planck";
import { getBodyUserData } from "../../engine/BodyUserData";
import {
  BTN_DIRECTION_OFFSET_Y,
  BTN_HALF_HEIGHT,
  BTN_HALF_WIDTH,
  BTN_SPACING,
  BTN_TOGGLE_OFFSET_Y,
} from "../../engine/OverlayRenderer";
import type { ToolContext, ToolHandler } from "../ToolHandler";

function hitButton(sx: number, sy: number, cx: number, cy: number): boolean {
  return Math.abs(sx - cx) < BTN_HALF_WIDTH && Math.abs(sy - cy) < BTN_HALF_HEIGHT;
}

export class SelectTool implements ToolHandler {
  /** Visible to Renderer for UI overlay */
  selectedBody: planck.Body | null = null;
  private ctx: ToolContext;

  constructor(ctx: ToolContext) {
    this.ctx = ctx;
  }

  onDown(wx: number, wy: number, sx: number, sy: number) {
    if (this.selectedBody) {
      const pos = this.selectedBody.getPosition();
      const sp = this.ctx.game.camera.toScreen(pos.x, pos.y, this.ctx.game.container);

      // Fixed/Free button
      const btnY = sp.y - BTN_TOGGLE_OFFSET_Y;
      if (hitButton(sx, sy, sp.x, btnY)) {
        const isStatic = this.selectedBody.isStatic();
        this.selectedBody.setType(isStatic ? "dynamic" : "static");
        return;
      }

      // Direction button (below fixed/free, only for directional bodies)
      let nextY = sp.y - BTN_DIRECTION_OFFSET_Y;
      if (isDirectional(this.selectedBody)) {
        if (hitButton(sx, sy, sp.x, nextY)) {
          reverseDirection(this.selectedBody, this.ctx.game.world);
          return;
        }
        nextY -= BTN_SPACING;
      }

      // Motor button
      if (hitButton(sx, sy, sp.x, nextY)) {
        toggleMotor(this.selectedBody);
        return;
      }
    }
    this.selectedBody = this.ctx.findBodyAt(wx, wy);
  }

  reset() {
    this.selectedBody = null;
  }
}

// ── Helpers (also used by Renderer) ──

export function getBodyLabel(body: import("planck").Body): string | undefined {
  return getBodyUserData(body)?.label;
}

export function isDirectional(body: import("planck").Body): boolean {
  const label = getBodyLabel(body);
  return label === "car" || label === "train" || label === "conveyor" || label === "rocket" || hasMotor(body);
}

export function hasMotor(body: import("planck").Body): boolean {
  const ud = getBodyUserData(body);
  return ud != null && ud.motorSpeed != null;
}

function reverseDirection(body: import("planck").Body, world: import("planck").World) {
  const label = getBodyLabel(body);
  if (label === "car" || label === "train") {
    for (let j = world.getJointList(); j; j = j.getNext()) {
      if (j.getType() === "wheel-joint" && (j.getBodyA() === body || j.getBodyB() === body)) {
        const wj = j as import("planck").WheelJoint;
        wj.setMotorSpeed(-wj.getMotorSpeed());
      }
    }
  } else if (label === "conveyor") {
    const ud = getBodyUserData(body);
    if (ud && ud.speed != null) ud.speed = -ud.speed;
  } else if (label === "rocket") {
    const ud = getBodyUserData(body);
    if (ud && ud.thrust != null) ud.thrust = -ud.thrust;
  }
  const mud = getBodyUserData(body);
  if (mud && mud.motorSpeed != null) mud.motorSpeed = -mud.motorSpeed;
}

function toggleMotor(body: import("planck").Body) {
  const ud = getBodyUserData(body);
  if (ud && ud.motorSpeed != null) {
    delete ud.motorSpeed;
  } else {
    if (body.isStatic()) body.setType("dynamic");
    const data = (body.getUserData() ?? {}) as Record<string, unknown>;
    data.motorSpeed = 5;
    body.setUserData(data);
    body.setAwake(true);
  }
}
