import * as planck from "planck";
import type { Game } from "../engine/Game";

export type Tool =
  | "box"
  | "ball"
  | "platform"
  | "rope"
  | "car"
  | "springball"
  | "launcher"
  | "conveyor"
  | "dynamite"
  | "ropetool"
  | "grab"
  | "erase"
  | "attach"
  | "detach"
  | "attract"
  | "select"
  | "seesaw"
  | "rocket"
  | "scale"
  | "balloon";

export const ERASE_RADIUS_PX = 24; // CSS pixels
export const GRAB_RADIUS_PX = 30; // CSS pixels — touch grab hit area

export class InputManager {
  tool: Tool = "grab";
  private mouseJoint: planck.MouseJoint | null = null;
  private grabbedStatic: planck.Body | null = null;
  private groundBody: planck.Body;
  private isPanning = false;
  private lastMouse = { x: 0, y: 0 };

  // Attach tool state
  attachPending: { body: planck.Body; world: { x: number; y: number } } | null = null;

  // Attract tool state: pulling two bodies together before welding
  attracting: { bodyA: planck.Body; bodyB: planck.Body } | null = null;

  // Platform drawing state (world coords)
  platformDraw: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;

  // Select tool state
  selectedBody: planck.Body | null = null;

  // Rope tool state
  ropePending: { body: planck.Body | null; x: number; y: number } | null = null;

  // Scale tool state
  scaleDrag: { body: planck.Body; startScreenY: number; currentScale: number } | null = null;

  // Multi-placement mode
  multiPlace = false;
  private multiPlaceInterval: ReturnType<typeof setInterval> | null = null;

  // Tool cursor position (screen coords, null when not active)
  toolCursor: { x: number; y: number } | null = null;

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
    this.bindContactListener();
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
        this.platformDraw = { start: { x: world.x, y: world.y }, end: { x: world.x, y: world.y } };
        break;
      case "rope":
        this.game.addChainRope(world.x, world.y, 8);
        break;
      case "car":
        this.game.addCar(world.x, world.y);
        break;
      case "springball":
        this.game.addSpringBall(world.x, world.y);
        break;
      case "launcher":
        this.game.addLauncher(world.x, world.y);
        break;
      case "seesaw":
        this.game.addSeesaw(world.x, world.y);
        break;
      case "rocket":
        this.game.addRocket(world.x, world.y);
        break;
      case "balloon":
        this.game.addBalloon(world.x, world.y);
        break;
      case "conveyor":
        this.platformDraw = { start: { x: world.x, y: world.y }, end: { x: world.x, y: world.y } };
        break;
      case "dynamite":
        this.game.addDynamite(world.x, world.y);
        break;
      case "erase":
        this.eraseAtScreen(e.clientX, e.clientY);
        break;
      case "attach":
        this.handleAttach(world.x, world.y);
        break;
      case "ropetool":
        this.handleRopeTool(world.x, world.y);
        break;
      case "detach":
        this.handleDetach(world.x, world.y);
        break;
      case "attract":
        this.handleAttract(world.x, world.y);
        break;
      case "select":
        this.handleSelect(world.x, world.y, e.clientX, e.clientY);
        break;
      case "scale":
        this.startScale(world.x, world.y, e.clientY);
        break;
    }
    this.startMultiPlace();
  }

  private onMouseMove(e: MouseEvent) {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse = { x: e.clientX, y: e.clientY };

    // Track tool cursor for visual feedback
    this.toolCursor = { x: e.clientX, y: e.clientY };

    if (this.isPanning) {
      this.game.camera.pan(dx, dy);
      return;
    }

    if (this.mouseJoint) {
      const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
      this.mouseJoint.setTarget(planck.Vec2(world.x, world.y));
    } else if (this.grabbedStatic) {
      const wdx = dx / this.game.camera.zoom;
      const wdy = -dy / this.game.camera.zoom;
      const pos = this.grabbedStatic.getPosition();
      this.grabbedStatic.setPosition(planck.Vec2(pos.x + wdx, pos.y + wdy));
    }

    if (this.tool === "erase" && e.buttons & 1) {
      this.eraseAtScreen(e.clientX, e.clientY);
    }

    if (this.platformDraw) {
      const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
      this.platformDraw.end = { x: world.x, y: world.y };
    }

    if (this.scaleDrag) {
      const deltaY = this.scaleDrag.startScreenY - e.clientY;
      this.scaleDrag.currentScale = Math.max(0.2, Math.min(5, 2 ** (deltaY / 150)));
    }
  }

  private onMouseUp(_e: MouseEvent) {
    this.isPanning = false;
    this.stopMultiPlace();
    if (this.mouseJoint) {
      this.game.world.destroyJoint(this.mouseJoint);
      this.mouseJoint = null;
    }
    this.grabbedStatic = null;
    this.finishPlatformDraw();
    this.finishScale();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.game.camera.zoomAt(e.clientX, e.clientY, factor, this.game.canvas);
  }

  private startGrab(wx: number, wy: number, radiusPx = 5) {
    const radius = radiusPx / this.game.camera.zoom;
    const point = planck.Vec2(wx, wy);
    let target: planck.Body | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    // Use a generous search area, then pick the closest body
    this.game.world.queryAABB(
      planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
      (fixture) => {
        const body = fixture.getBody();
        // Exact hit: use immediately
        if (fixture.testPoint(point)) {
          target = body;
          bestDist = 0;
          return false;
        }
        // Proximity hit: pick closest body center within search area
        const d = planck.Vec2.lengthOf(planck.Vec2.sub(body.getPosition(), point));
        if (d < bestDist) {
          bestDist = d;
          target = body;
        }
        return true;
      },
    );

    if (target) {
      const t = target as planck.Body;
      if (t.isDynamic()) {
        this.mouseJoint = this.game.world.createJoint(
          planck.MouseJoint({ maxForce: 1000 * t.getMass() }, this.groundBody, t, point),
        ) as planck.MouseJoint;
      } else {
        // Static/kinematic: drag by directly moving position
        this.grabbedStatic = t;
      }
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

    if (e.touches.length === 1) {
      const t = e.touches[0];
      if (this.tool === "grab") {
        this.toolCursor = { x: t.clientX, y: t.clientY };
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        this.startGrab(world.x, world.y, GRAB_RADIUS_PX);
      } else if (this.tool === "scale") {
        this.toolCursor = { x: t.clientX, y: t.clientY };
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        this.startScale(world.x, world.y, t.clientY);
        this.touchToolFired = true;
      } else if (this.tool === "platform" || this.tool === "conveyor") {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        this.platformDraw = { start: { x: world.x, y: world.y }, end: { x: world.x, y: world.y } };
        this.touchToolFired = true;
      } else if (this.tool === "erase") {
        this.toolCursor = { x: t.clientX, y: t.clientY };
        this.eraseAtScreen(t.clientX, t.clientY);
        this.touchToolFired = true;
      }
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
      this.grabbedStatic = null;
      this.scaleDrag = null;
      this.stopMultiPlace();
      this.platformDraw = null;

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
      const t = cur[0];

      if (this.mouseJoint) {
        // Dragging a grabbed dynamic object
        const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
        this.mouseJoint.setTarget(planck.Vec2(world.x, world.y));
      } else if (this.grabbedStatic) {
        const prev = this.lastTouches.find((lt) => lt.id === t.id) ?? this.lastTouches[0];
        const tdx = (t.x - prev.x) / this.game.camera.zoom;
        const tdy = -(t.y - prev.y) / this.game.camera.zoom;
        const pos = this.grabbedStatic.getPosition();
        this.grabbedStatic.setPosition(planck.Vec2(pos.x + tdx, pos.y + tdy));
      } else if (this.scaleDrag) {
        this.toolCursor = { x: t.x, y: t.y };
        const deltaY = this.scaleDrag.startScreenY - t.y;
        this.scaleDrag.currentScale = Math.max(0.2, Math.min(5, 2 ** (deltaY / 150)));
      } else if (this.tool === "erase") {
        this.toolCursor = { x: t.x, y: t.y };
        this.eraseAtScreen(t.x, t.y);
        this.touchToolFired = true;
      } else if (this.platformDraw) {
        const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
        this.platformDraw.end = { x: world.x, y: world.y };
      } else if (this.multiPlaceInterval) {
        this.lastMouse = { x: t.x, y: t.y };
      } else if (this.multiPlace && this.CREATION_TOOLS.has(this.tool)) {
        // Start multi-place on first single-finger move (not touchstart)
        // to avoid placing when user intends to two-finger pan
        const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
        this.placeCreationTool(world.x, world.y);
        this.lastMouse = { x: t.x, y: t.y };
        this.startMultiPlace();
        this.touchToolFired = true;
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
        case "rope":
          this.game.addChainRope(world.x, world.y, 8);
          break;
        case "car":
          this.game.addCar(world.x, world.y);
          break;
        case "springball":
          this.game.addSpringBall(world.x, world.y);
          break;
        case "launcher":
          this.game.addLauncher(world.x, world.y);
          break;
        case "seesaw":
          this.game.addSeesaw(world.x, world.y);
          break;
        case "rocket":
          this.game.addRocket(world.x, world.y);
          break;
        case "balloon":
          this.game.addBalloon(world.x, world.y);
          break;
        case "dynamite":
          this.game.addDynamite(world.x, world.y);
          break;
        case "erase":
          this.eraseAtScreen(t.x, t.y);
          break;
        case "attach": {
          this.handleAttach(world.x, world.y);
          break;
        }
        case "ropetool":
          this.handleRopeTool(world.x, world.y);
          break;
        case "detach":
          this.handleDetach(world.x, world.y);
          break;
        case "attract":
          this.handleAttract(world.x, world.y);
          break;
        case "select":
          this.handleSelect(world.x, world.y, t.x, t.y);
          break;
      }
    }

    // Finish platform draw / stop multi-place / apply scale on touch end
    if (e.touches.length === 0) {
      this.finishPlatformDraw();
      this.finishScale();
      this.stopMultiPlace();
    }

    // Clear erase cursor on touch end
    if (e.touches.length === 0) this.toolCursor = null;

    // Release grab
    if (e.touches.length === 0) {
      if (this.mouseJoint) {
        this.game.world.destroyJoint(this.mouseJoint);
        this.mouseJoint = null;
      }
      this.grabbedStatic = null;
    }

    this.lastTouches = this.snapTouches(e);
  }

  /** Erase all bodies within the erase cursor radius */
  private eraseAtScreen(sx: number, sy: number) {
    const r = ERASE_RADIUS_PX / this.game.camera.zoom; // world units
    const world = this.game.camera.toWorld(sx, sy, this.game.canvas);
    const center = planck.Vec2(world.x, world.y);
    const toRemove: planck.Body[] = [];

    this.game.world.queryAABB(
      planck.AABB(planck.Vec2(world.x - r, world.y - r), planck.Vec2(world.x + r, world.y + r)),
      (fixture) => {
        const body = fixture.getBody();
        if (body === this.groundBody) return true;
        const d = planck.Vec2.lengthOf(planck.Vec2.sub(body.getPosition(), center));
        if (d < r) toRemove.push(body);
        return true;
      },
    );

    for (const b of toRemove) this.game.world.destroyBody(b);
  }

  private finishPlatformDraw() {
    if (!this.platformDraw) return;
    const { start, end } = this.platformDraw;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.hypot(dx, dy);
    if (len > 0.3) {
      const cx = (start.x + end.x) / 2;
      const cy = (start.y + end.y) / 2;
      const angle = Math.atan2(dy, dx);
      if (this.tool === "conveyor") {
        this.game.addConveyor(cx, cy, len, 3, angle);
      } else {
        this.game.addPlatform(cx, cy, len, angle);
      }
    }
    this.platformDraw = null;
  }

  private startScale(wx: number, wy: number, screenY: number) {
    const body = this.findBodyAt(wx, wy, 20);
    if (body) {
      this.scaleDrag = { body, startScreenY: screenY, currentScale: 1 };
    }
  }

  private finishScale() {
    if (!this.scaleDrag) return;
    const { body, currentScale } = this.scaleDrag;
    this.scaleDrag = null;
    if (Math.abs(currentScale - 1) < 0.05) return;
    this.game.scaleBody(body, currentScale);
  }

  /** Find the nearest body at world coords */
  private findBodyAt(wx: number, wy: number, radiusPx = 10): planck.Body | null {
    const radius = radiusPx / this.game.camera.zoom;
    const point = planck.Vec2(wx, wy);
    let target: planck.Body | null = null;
    let bestDist = Number.POSITIVE_INFINITY;

    this.game.world.queryAABB(
      planck.AABB(planck.Vec2(wx - radius, wy - radius), planck.Vec2(wx + radius, wy + radius)),
      (fixture) => {
        const body = fixture.getBody();
        if (fixture.testPoint(point)) {
          target = body;
          bestDist = 0;
          return false;
        }
        const d = planck.Vec2.lengthOf(planck.Vec2.sub(body.getPosition(), point));
        if (d < bestDist) {
          bestDist = d;
          target = body;
        }
        return true;
      },
    );

    return target;
  }

  /** Handle rope tool: two clicks to create a rope between points/bodies */
  private handleRopeTool(wx: number, wy: number) {
    const body = this.findBodyAt(wx, wy);

    if (!this.ropePending) {
      this.ropePending = { body, x: wx, y: wy };
    } else {
      const a = this.ropePending;
      // Don't rope a body to itself
      if (!(a.body && a.body === body)) {
        this.game.addRopeBetween(a.x, a.y, wx, wy, a.body, body);
      }
      this.ropePending = null;
    }
  }

  /** Handle attach tool click: first click selects, second click welds */
  private handleAttach(wx: number, wy: number) {
    const body = this.findBodyAt(wx, wy);
    if (!body) return;

    if (!this.attachPending) {
      // First click: select body
      this.attachPending = { body, world: { x: wx, y: wy } };
    } else {
      // Second click: attach to first body
      if (body !== this.attachPending.body) {
        const midX = (this.attachPending.world.x + wx) / 2;
        const midY = (this.attachPending.world.y + wy) / 2;
        this.game.world.createJoint(planck.WeldJoint({}, this.attachPending.body, body, planck.Vec2(midX, midY)));
      }
      this.attachPending = null;
    }
  }

  /** Remove all weld joints from a clicked body */
  private handleDetach(wx: number, wy: number) {
    const body = this.findBodyAt(wx, wy);
    if (!body) return;

    const toRemove: planck.Joint[] = [];
    for (let j = this.game.world.getJointList(); j; j = j.getNext()) {
      if (j.getType() === "weld-joint" && (j.getBodyA() === body || j.getBodyB() === body)) {
        toRemove.push(j);
      }
    }
    for (const j of toRemove) this.game.world.destroyJoint(j);
  }

  /** Handle attract tool: select two bodies, pull them together with a spring, weld on contact */
  private handleAttract(wx: number, wy: number) {
    // If already attracting, cancel on any click
    if (this.attracting) {
      this.cancelAttract();
      return;
    }

    const body = this.findBodyAt(wx, wy);
    if (!body) return;

    if (!this.attachPending) {
      this.attachPending = { body, world: { x: wx, y: wy } };
    } else {
      if (body !== this.attachPending.body) {
        this.attracting = { bodyA: this.attachPending.body, bodyB: body };
      }
      this.attachPending = null;
    }
  }

  private cancelAttract() {
    this.attracting = null;
  }

  /** Apply attraction forces — call once per frame */
  update() {
    if (!this.attracting) return;
    const { bodyA, bodyB } = this.attracting;
    const dir = planck.Vec2.sub(bodyA.getPosition(), bodyB.getPosition());
    const len = planck.Vec2.lengthOf(dir);
    if (len < 0.01) return;
    const force = planck.Vec2.mul(dir, (50 * bodyB.getMass()) / len);
    bodyB.applyForceToCenter(force, true);
    if (bodyA.isDynamic()) {
      bodyA.applyForceToCenter(planck.Vec2.mul(force, -1), true);
    }
  }

  private bindContactListener() {
    this.game.world.on("begin-contact", (contact) => {
      if (!this.attracting) return;
      const { bodyA, bodyB } = this.attracting;
      const cA = contact.getFixtureA().getBody();
      const cB = contact.getFixtureB().getBody();
      const match = (cA === bodyA && cB === bodyB) || (cA === bodyB && cB === bodyA);
      if (!match) return;

      const manifold = contact.getWorldManifold(null);
      const weldPoint = manifold?.points[0] ?? bodyA.getPosition();
      // Defer joint creation to after physics step
      setTimeout(() => {
        if (!this.attracting) return;
        this.game.world.createJoint(planck.WeldJoint({}, bodyA, bodyB, weldPoint));
        this.attracting = null;
      }, 0);
    });
  }

  private getBodyLabel(body: planck.Body): string | undefined {
    return (body.getUserData() as { label?: string } | null)?.label;
  }

  isDirectional(body: planck.Body): boolean {
    const label = this.getBodyLabel(body);
    return label === "car" || label === "conveyor" || label === "rocket" || this.hasMotor(body);
  }

  hasMotor(body: planck.Body): boolean {
    for (let j = this.game.world.getJointList(); j; j = j.getNext()) {
      if (j.getType() !== "revolute-joint") continue;
      const other = j.getBodyA() === body ? j.getBodyB() : j.getBodyB() === body ? j.getBodyA() : null;
      if (other && this.getBodyLabel(other) === "motor-anchor") return true;
    }
    return false;
  }

  private handleSelect(wx: number, wy: number, sx: number, sy: number) {
    if (this.selectedBody) {
      const pos = this.selectedBody.getPosition();
      const sp = this.game.camera.toScreen(pos.x, pos.y, this.game.canvas);

      // Fixed/Free button
      const btnY = sp.y - 30;
      if (Math.abs(sx - sp.x) < 40 && Math.abs(sy - btnY) < 14) {
        const isStatic = this.selectedBody.isStatic();
        this.selectedBody.setType(isStatic ? "dynamic" : "static");
        return;
      }

      // Direction button (below fixed/free, only for directional bodies)
      let nextY = sp.y - 55;
      if (this.isDirectional(this.selectedBody)) {
        if (Math.abs(sx - sp.x) < 40 && Math.abs(sy - nextY) < 14) {
          this.reverseDirection(this.selectedBody);
          return;
        }
        nextY -= 25;
      }

      // Motor button
      if (Math.abs(sx - sp.x) < 40 && Math.abs(sy - nextY) < 14) {
        this.toggleMotor(this.selectedBody);
        return;
      }
    }
    const body = this.findBodyAt(wx, wy);
    this.selectedBody = body;
  }

  private reverseDirection(body: planck.Body) {
    const label = this.getBodyLabel(body);
    if (label === "car") {
      // Reverse all wheel joints attached to this body
      for (let j = this.game.world.getJointList(); j; j = j.getNext()) {
        if (j.getType() === "wheel-joint" && (j.getBodyA() === body || j.getBodyB() === body)) {
          const wj = j as planck.WheelJoint;
          wj.setMotorSpeed(-wj.getMotorSpeed());
        }
      }
    } else if (label === "conveyor") {
      const ud = body.getUserData() as { speed?: number } | null;
      if (ud && ud.speed != null) {
        ud.speed = -ud.speed;
      }
    } else if (label === "rocket") {
      const ud = body.getUserData() as { thrust?: number } | null;
      if (ud && ud.thrust != null) {
        ud.thrust = -ud.thrust;
      }
    }
    // Reverse motor joints
    for (let j = this.game.world.getJointList(); j; j = j.getNext()) {
      if (j.getType() !== "revolute-joint") continue;
      const other = j.getBodyA() === body ? j.getBodyB() : j.getBodyB() === body ? j.getBodyA() : null;
      if (other && this.getBodyLabel(other) === "motor-anchor") {
        const rj = j as planck.RevoluteJoint;
        rj.setMotorSpeed(-rj.getMotorSpeed());
      }
    }
  }

  private toggleMotor(body: planck.Body) {
    // Check if motor already exists — if so, remove it
    for (let j = this.game.world.getJointList(); j; j = j.getNext()) {
      if (j.getType() !== "revolute-joint") continue;
      const other = j.getBodyA() === body ? j.getBodyB() : j.getBodyB() === body ? j.getBodyA() : null;
      if (other && this.getBodyLabel(other) === "motor-anchor") {
        this.game.world.destroyJoint(j);
        this.game.world.destroyBody(other);
        return;
      }
    }

    // Create motor: static anchor + revolute joint with motor
    const pos = body.getPosition();
    const anchor = this.game.world.createBody({ type: "static", position: planck.Vec2(pos.x, pos.y) });
    anchor.createFixture({ shape: planck.Circle(0.01), isSensor: true });
    anchor.setUserData({ label: "motor-anchor" });

    // Make sure the body is dynamic so the motor can spin it
    if (body.isStatic()) body.setType("dynamic");

    this.game.world.createJoint(
      planck.RevoluteJoint(
        { enableMotor: true, motorSpeed: 5, maxMotorTorque: 500 },
        anchor,
        body,
        planck.Vec2(pos.x, pos.y),
      ),
    );

    // Wake body so motor takes effect immediately
    body.setAwake(true);
  }

  private readonly CREATION_TOOLS = new Set<Tool>([
    "box",
    "ball",
    "rope",
    "car",
    "springball",
    "dynamite",
    "rocket",
    "balloon",
    "seesaw",
    "launcher",
  ]);

  private startMultiPlace() {
    if (!this.multiPlace || !this.CREATION_TOOLS.has(this.tool)) return;
    this.stopMultiPlace();
    this.multiPlaceInterval = setInterval(() => {
      const world = this.game.camera.toWorld(this.lastMouse.x, this.lastMouse.y, this.game.canvas);
      this.placeCreationTool(world.x, world.y);
    }, 100);
  }

  private stopMultiPlace() {
    if (this.multiPlaceInterval) {
      clearInterval(this.multiPlaceInterval);
      this.multiPlaceInterval = null;
    }
  }

  private placeCreationTool(wx: number, wy: number) {
    switch (this.tool) {
      case "box":
        this.game.addBox(wx, wy);
        break;
      case "ball":
        this.game.addBall(wx, wy);
        break;
      case "rope":
        this.game.addChainRope(wx, wy, 8);
        break;
      case "car":
        this.game.addCar(wx, wy);
        break;
      case "springball":
        this.game.addSpringBall(wx, wy);
        break;
      case "dynamite":
        this.game.addDynamite(wx, wy);
        break;
      case "rocket":
        this.game.addRocket(wx, wy);
        break;
      case "balloon":
        this.game.addBalloon(wx, wy);
        break;
      case "seesaw":
        this.game.addSeesaw(wx, wy);
        break;
      case "launcher":
        this.game.addLauncher(wx, wy);
        break;
    }
  }

  resetGroundBody() {
    this.groundBody = this.game.world.createBody({ type: "static" });
  }

  setTool(tool: Tool) {
    this.tool = tool;
    this.attachPending = null;
    this.selectedBody = null;
    this.ropePending = null;
    this.scaleDrag = null;
    this.cancelAttract();
    this.onToolChange?.(tool);
  }
}
