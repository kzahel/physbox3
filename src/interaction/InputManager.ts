import * as planck from "planck";
import type { Game } from "../engine/Game";

export type Tool = "box" | "ball" | "platform" | "rope" | "grab" | "erase";

export class InputManager {
  tool: Tool = "grab";
  private mouseJoint: planck.MouseJoint | null = null;
  private groundBody: planck.Body;
  private isPanning = false;
  private lastMouse = { x: 0, y: 0 };

  // Touch state
  private lastTouches: { id: number; x: number; y: number }[] = [];
  private touchToolFired = false;

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

    // Touch events for mobile
    canvas.addEventListener("touchstart", (e) => this.onTouchStart(e), { passive: false });
    canvas.addEventListener("touchmove", (e) => this.onTouchMove(e), { passive: false });
    canvas.addEventListener("touchend", (e) => this.onTouchEnd(e));
    canvas.addEventListener("touchcancel", (e) => this.onTouchEnd(e));

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

  private snapTouches(e: TouchEvent): { id: number; x: number; y: number }[] {
    return Array.from(e.touches).map((t) => ({ id: t.identifier, x: t.clientX, y: t.clientY }));
  }

  private touchDist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault();
    this.lastTouches = this.snapTouches(e);
    this.touchToolFired = false;

    // Single finger + grab tool → start grab
    if (e.touches.length === 1 && this.tool === "grab") {
      const t = e.touches[0];
      const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
      this.startGrab(world.x, world.y);
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    const cur = this.snapTouches(e);

    if (cur.length >= 2 && this.lastTouches.length >= 2) {
      // Release any grab when second finger comes in
      if (this.mouseJoint) {
        this.game.world.destroyJoint(this.mouseJoint);
        this.mouseJoint = null;
      }

      // Two-finger pan + pinch zoom
      const prevA = this.lastTouches[0];
      const prevB = this.lastTouches[1];
      const curA = cur[0];
      const curB = cur[1];

      // Pan: average movement of both fingers
      const dx = (curA.x + curB.x - prevA.x - prevB.x) / 2;
      const dy = (curA.y + curB.y - prevA.y - prevB.y) / 2;
      this.game.camera.pan(dx, dy);

      // Pinch zoom
      const prevDist = this.touchDist(prevA, prevB);
      const curDist = this.touchDist(curA, curB);
      if (prevDist > 0) {
        const midX = (curA.x + curB.x) / 2;
        const midY = (curA.y + curB.y) / 2;
        this.game.camera.zoomAt(midX, midY, curDist / prevDist, this.game.canvas);
      }
    } else if (cur.length === 1 && this.lastTouches.length >= 1) {
      const prev = this.lastTouches[0];
      const t = cur[0];

      if (this.mouseJoint) {
        // Dragging a grabbed object
        const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
        this.mouseJoint.setTarget(planck.Vec2(world.x, world.y));
      } else if (this.tool === "erase") {
        const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
        this.game.destroyBodyAt(world.x, world.y);
        this.touchToolFired = true;
      } else if (this.tool !== "grab") {
        // Single-finger pan when using placement tools (place on tap, pan on drag)
        const dx = t.x - prev.x;
        const dy = t.y - prev.y;
        if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
          this.game.camera.pan(dx, dy);
          this.touchToolFired = true; // suppress tap-to-place after drag
        }
      }
    }

    this.lastTouches = cur;
  }

  private onTouchEnd(e: TouchEvent) {
    // Fire tool action on single-finger tap (touchstart → touchend with no significant move)
    if (e.touches.length === 0 && this.lastTouches.length === 1 && !this.touchToolFired) {
      const t = this.lastTouches[0];
      const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);

      switch (this.tool) {
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

    // Release grab
    if (e.touches.length === 0 && this.mouseJoint) {
      this.game.world.destroyJoint(this.mouseJoint);
      this.mouseJoint = null;
    }

    this.lastTouches = this.snapTouches(e);
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.onToolChange?.(tool);
  }
}
