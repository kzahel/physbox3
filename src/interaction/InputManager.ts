import * as planck from "planck";
import type { Game } from "../engine/Game";

export type Tool = "box" | "ball" | "platform" | "rope" | "grab" | "erase";

export class InputManager {
  tool: Tool = "grab";
  private mouseJoint: planck.MouseJoint | null = null;
  private groundBody: planck.Body;
  private isPanning = false;
  private lastMouse = { x: 0, y: 0 };

  // Keyboard state
  private keys = new Set<string>();
  private game: Game;

  onToolChange?: (tool: Tool) => void;

  constructor(game: Game) {
    this.game = game;
    this.groundBody = game.world.createBody({ type: "static" });
    this.bind();
  }

  private bind() {
    const canvas = this.game.canvas;

    canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

    window.addEventListener("keydown", (e) => {
      this.keys.add(e.key);
      if (e.key === " ") {
        e.preventDefault();
        this.game.paused = !this.game.paused;
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key));

    // Camera pan with WASD
    const panSpeed = 8;
    const tick = () => {
      if (this.keys.has("w") || this.keys.has("W")) this.game.camera.y += panSpeed / this.game.camera.zoom;
      if (this.keys.has("s") || this.keys.has("S")) this.game.camera.y -= panSpeed / this.game.camera.zoom;
      if (this.keys.has("a") || this.keys.has("A")) this.game.camera.x -= panSpeed / this.game.camera.zoom;
      if (this.keys.has("d") || this.keys.has("D")) this.game.camera.x += panSpeed / this.game.camera.zoom;
      requestAnimationFrame(tick);
    };
    tick();
  }

  private onMouseDown(e: MouseEvent) {
    this.lastMouse = { x: e.clientX, y: e.clientY };

    // Middle click or right click → pan
    if (e.button === 1 || e.button === 2) {
      this.isPanning = true;
      return;
    }

    const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);

    switch (this.tool) {
      case "grab":
        this.startGrab(world.x, world.y);
        break;
      case "box":
        this.game.addBox(world.x, world.y);
        break;
      case "ball":
        this.game.addBall(world.x, world.y);
        break;
      case "platform":
        this.game.addPlatform(world.x, world.y, 6);
        break;
      case "rope":
        this.game.addChainRope(world.x, world.y, 8);
        break;
      case "erase":
        this.game.destroyBodyAt(world.x, world.y);
        break;
    }
  }

  private onMouseMove(e: MouseEvent) {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse = { x: e.clientX, y: e.clientY };

    if (this.isPanning) {
      this.game.camera.pan(dx, dy);
      return;
    }

    if (this.mouseJoint) {
      const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
      this.mouseJoint.setTarget(planck.Vec2(world.x, world.y));
    }

    if (this.tool === "erase" && e.buttons & 1) {
      const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
      this.game.destroyBodyAt(world.x, world.y);
    }
  }

  private onMouseUp(_e: MouseEvent) {
    this.isPanning = false;
    if (this.mouseJoint) {
      this.game.world.destroyJoint(this.mouseJoint);
      this.mouseJoint = null;
    }
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.game.camera.zoomAt(e.clientX, e.clientY, factor, this.game.canvas);
  }

  private startGrab(wx: number, wy: number) {
    const point = planck.Vec2(wx, wy);
    let target: planck.Body | null = null;

    this.game.world.queryAABB(
      planck.AABB(planck.Vec2(wx - 0.01, wy - 0.01), planck.Vec2(wx + 0.01, wy + 0.01)),
      (fixture) => {
        if (fixture.testPoint(point) && fixture.getBody().isDynamic()) {
          target = fixture.getBody();
          return false;
        }
        return true;
      },
    );

    if (target) {
      this.mouseJoint = this.game.world.createJoint(
        planck.MouseJoint(
          {
            maxForce: 1000 * (target as planck.Body).getMass(),
          },
          this.groundBody,
          target as planck.Body,
          point,
        ),
      ) as planck.MouseJoint;
    }
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.onToolChange?.(tool);
  }
}
