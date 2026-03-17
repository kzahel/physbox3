import type * as planck from "planck";
import {
  BTN_DIRECTION_OFFSET_Y,
  BTN_HALF_HEIGHT,
  BTN_HALF_WIDTH,
  BTN_SPACING,
  BTN_TOGGLE_OFFSET_Y,
} from "../../engine/Renderer";
import type { ToolContext, ToolHandler } from "../ToolHandler";

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
      if (Math.abs(sx - sp.x) < BTN_HALF_WIDTH && Math.abs(sy - btnY) < BTN_HALF_HEIGHT) {
        const isStatic = this.selectedBody.isStatic();
        this.selectedBody.setType(isStatic ? "dynamic" : "static");
        return;
      }

      // Direction button (below fixed/free, only for directional bodies)
      let nextY = sp.y - BTN_DIRECTION_OFFSET_Y;
      if (isDirectional(this.selectedBody)) {
        if (Math.abs(sx - sp.x) < BTN_HALF_WIDTH && Math.abs(sy - nextY) < BTN_HALF_HEIGHT) {
          reverseDirection(this.selectedBody, this.ctx.game.world);
          return;
        }
        nextY -= BTN_SPACING;
      }

      // Motor button
      if (Math.abs(sx - sp.x) < BTN_HALF_WIDTH && Math.abs(sy - nextY) < BTN_HALF_HEIGHT) {
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
  return (body.getUserData() as { label?: string } | null)?.label;
}

export function isDirectional(body: import("planck").Body): boolean {
  const label = getBodyLabel(body);
  return label === "car" || label === "conveyor" || label === "rocket" || hasMotor(body);
}

export function hasMotor(body: import("planck").Body): boolean {
  const ud = body.getUserData() as { motorSpeed?: number } | null;
  return ud != null && ud.motorSpeed != null;
}

function reverseDirection(body: import("planck").Body, world: import("planck").World) {
  const label = getBodyLabel(body);
  if (label === "car") {
    for (let j = world.getJointList(); j; j = j.getNext()) {
      if (j.getType() === "wheel-joint" && (j.getBodyA() === body || j.getBodyB() === body)) {
        const wj = j as import("planck").WheelJoint;
        wj.setMotorSpeed(-wj.getMotorSpeed());
      }
    }
  } else if (label === "conveyor") {
    const ud = body.getUserData() as { speed?: number } | null;
    if (ud && ud.speed != null) ud.speed = -ud.speed;
  } else if (label === "rocket") {
    const ud = body.getUserData() as { thrust?: number } | null;
    if (ud && ud.thrust != null) ud.thrust = -ud.thrust;
  }
  const mud = body.getUserData() as { motorSpeed?: number } | null;
  if (mud && mud.motorSpeed != null) mud.motorSpeed = -mud.motorSpeed;
}

function toggleMotor(body: import("planck").Body) {
  const ud = body.getUserData() as { motorSpeed?: number } | null;
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
