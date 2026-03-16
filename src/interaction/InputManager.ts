import * as planck from "planck";
import type { Game } from "../engine/Game";
import { RagdollController } from "./RagdollController";
import type { ToolContext, ToolHandler } from "./ToolHandler";
import { AttachTool } from "./tools/AttachTool";
import { AttractTool } from "./tools/AttractTool";
import { CreationTool } from "./tools/CreationTool";
import { DetachTool } from "./tools/DetachTool";
import { EraseTool } from "./tools/EraseTool";
import { GlueTool, UnGlueTool } from "./tools/GlueTool";
import { GrabTool } from "./tools/GrabTool";
import { PlatformDrawTool } from "./tools/PlatformDrawTool";
import { RopeTool, SpringTool } from "./tools/RopeTool";
import { ScaleTool } from "./tools/ScaleTool";
import { SelectTool } from "./tools/SelectTool";

// Re-export constants and helpers that Renderer needs
export { ERASE_RADIUS_PX } from "./tools/EraseTool";
export { GLUE_RADIUS_PX } from "./tools/GlueTool";
export { GRAB_RADIUS_PX } from "./tools/GrabTool";
export { hasMotor, isDirectional } from "./tools/SelectTool";

export type Tool =
  | "box"
  | "ball"
  | "platform"
  | "car"
  | "springball"
  | "launcher"
  | "conveyor"
  | "dynamite"
  | "ropetool"
  | "spring"
  | "grab"
  | "erase"
  | "attach"
  | "detach"
  | "attract"
  | "select"
  | "seesaw"
  | "rocket"
  | "scale"
  | "balloon"
  | "fan"
  | "ragdoll"
  | "cannon"
  | "glue"
  | "unglue";

const CREATION_TOOL_IDS: Tool[] = [
  "box",
  "ball",
  "car",
  "springball",
  "launcher",
  "seesaw",
  "balloon",
  "ragdoll",
  "dynamite",
];

export class InputManager {
  tool: Tool = "grab";

  // Multi-placement mode
  multiPlace = false;
  private multiPlaceInterval: ReturnType<typeof setInterval> | null = null;

  // Tool cursor position (screen coords, null when not active)
  toolCursor: { x: number; y: number } | null = null;

  // Keyboard state
  private keys = new Set<string>();
  private game: Game;
  private groundBody: planck.Body;

  // Pan state
  private isPanning = false;
  private lastMouse = { x: 0, y: 0 };

  // Touch state
  private lastTouches: { id: number; x: number; y: number }[] = [];
  private touchToolFired = false;

  // Tool handlers
  private handlers: Record<Tool, ToolHandler>;
  private ragdollController: RagdollController;

  // Typed accessors for tool-specific state (used by Renderer)
  readonly grabTool: GrabTool;
  readonly selectTool: SelectTool;
  readonly attachTool: AttachTool;
  readonly attractTool: AttractTool;
  readonly scaleTool: ScaleTool;
  readonly ropeTool: RopeTool;
  readonly springTool: SpringTool;
  readonly platformTools: Map<Tool, PlatformDrawTool>;

  onToolChange?: (tool: Tool) => void;

  constructor(game: Game) {
    this.game = game;
    this.groundBody = game.world.createBody({ type: "static" });

    const ctx: ToolContext = {
      game,
      groundBody: this.groundBody,
      findBodyAt: (wx, wy, radiusPx) => this.findBodyAt(wx, wy, radiusPx),
    };

    // Create tool handlers
    this.grabTool = new GrabTool(ctx);
    const eraseTool = new EraseTool(ctx);
    const glueTool = new GlueTool(ctx);
    const unGlueTool = new UnGlueTool(ctx);
    this.attachTool = new AttachTool(ctx);
    const detachTool = new DetachTool(ctx);
    this.ropeTool = new RopeTool(ctx);
    this.springTool = new SpringTool(ctx);
    this.attractTool = new AttractTool(ctx);
    this.selectTool = new SelectTool(ctx);
    this.scaleTool = new ScaleTool(ctx);

    // Platform-draw family
    const platformTool = new PlatformDrawTool(ctx, "platform");
    const conveyorTool = new PlatformDrawTool(ctx, "conveyor");
    const fanTool = new PlatformDrawTool(ctx, "fan");
    const cannonTool = new PlatformDrawTool(ctx, "cannon");
    const rocketTool = new PlatformDrawTool(ctx, "rocket");
    this.platformTools = new Map<Tool, PlatformDrawTool>([
      ["platform", platformTool],
      ["conveyor", conveyorTool],
      ["fan", fanTool],
      ["cannon", cannonTool],
      ["rocket", rocketTool],
    ]);

    // Creation tools
    const creationTools: Partial<Record<Tool, CreationTool>> = {};
    for (const t of CREATION_TOOL_IDS) {
      creationTools[t] = new CreationTool(ctx, t);
    }

    this.handlers = {
      grab: this.grabTool,
      erase: eraseTool,
      glue: glueTool,
      unglue: unGlueTool,
      attach: this.attachTool,
      detach: detachTool,
      ropetool: this.ropeTool,
      spring: this.springTool,
      attract: this.attractTool,
      select: this.selectTool,
      scale: this.scaleTool,
      platform: platformTool,
      conveyor: conveyorTool,
      fan: fanTool,
      cannon: cannonTool,
      rocket: rocketTool,
      box: creationTools.box!,
      ball: creationTools.ball!,
      car: creationTools.car!,
      springball: creationTools.springball!,
      launcher: creationTools.launcher!,
      seesaw: creationTools.seesaw!,
      balloon: creationTools.balloon!,
      ragdoll: creationTools.ragdoll!,
      dynamite: creationTools.dynamite!,
    };

    this.ragdollController = new RagdollController(game, this.keys);
    this.attractTool.ensureContactListener();
    this.bind();
  }

  /** Current active tool handler */
  private get handler(): ToolHandler {
    return this.handlers[this.tool];
  }

  // ── Renderer-visible state accessors ──

  get selectedBody() {
    return this.selectTool.selectedBody;
  }

  set selectedBody(v) {
    this.selectTool.selectedBody = v;
  }

  get attachPending() {
    return this.attachTool.attachPending;
  }

  get ropePending(): { body: import("planck").Body | null; x: number; y: number } | null {
    if (this.tool === "spring") return this.springTool.ropePending;
    return this.ropeTool.ropePending;
  }

  get scaleDrag() {
    return this.scaleTool.scaleDrag;
  }

  get attracting() {
    return this.attractTool.attracting;
  }

  get platformDraw() {
    const pt = this.platformTools.get(this.tool);
    return pt?.platformDraw ?? null;
  }

  // ── Public methods ──

  setTool(tool: Tool) {
    this.handler.reset?.();
    this.tool = tool;
    this.onToolChange?.(tool);
  }

  update() {
    this.ragdollController.update();
    this.attractTool.update();
  }

  resetGroundBody() {
    this.groundBody = this.game.world.createBody({ type: "static" });
    // Update context for all handlers — handlers store a reference to the ctx object
    // which has groundBody as a property, so we update the shared ctx
    const ctx = (this.grabTool as unknown as { ctx: ToolContext }).ctx;
    ctx.groundBody = this.groundBody;
    this.attractTool.rebindContactListener();
    this.attractTool.ensureContactListener();
  }

  // ── Event binding ──

  private bind() {
    const canvas = this.game.canvas;

    canvas.addEventListener("mousedown", (e) => this.onMouseDown(e));
    canvas.addEventListener("mousemove", (e) => this.onMouseMove(e));
    canvas.addEventListener("mouseup", (e) => this.onMouseUp(e));
    canvas.addEventListener("wheel", (e) => this.onWheel(e), { passive: false });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());

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
      if (e.key.startsWith("Arrow")) e.preventDefault();
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

  // ── Mouse events ──

  private onMouseDown(e: MouseEvent) {
    this.lastMouse = { x: e.clientX, y: e.clientY };

    if (e.button === 1 || e.button === 2) {
      this.isPanning = true;
      return;
    }

    const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
    this.handler.onDown?.(world.x, world.y, e.clientX, e.clientY);
    this.startMultiPlace();
  }

  private onMouseMove(e: MouseEvent) {
    const dx = e.clientX - this.lastMouse.x;
    const dy = e.clientY - this.lastMouse.y;
    this.lastMouse = { x: e.clientX, y: e.clientY };
    this.toolCursor = { x: e.clientX, y: e.clientY };

    if (this.isPanning) {
      this.game.camera.pan(dx, dy);
      return;
    }

    const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.canvas);
    this.handler.onMove?.(world.x, world.y, dx, dy, e.clientX, e.clientY);

    // Brush tools: continuous application while dragging
    if (e.buttons & 1) {
      this.handler.onBrush?.(world.x, world.y, e.clientX, e.clientY);
    }
  }

  private onMouseUp(_e: MouseEvent) {
    this.isPanning = false;
    this.stopMultiPlace();
    this.handler.onUp?.();
  }

  private onWheel(e: WheelEvent) {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    this.game.camera.zoomAt(e.clientX, e.clientY, factor, this.game.canvas);
  }

  // ── Touch events ──

  private snapTouches(e: TouchEvent): { id: number; x: number; y: number }[] {
    return Array.from(e.touches).map((t) => ({
      id: t.identifier,
      x: t.clientX,
      y: t.clientY,
    }));
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
      this.toolCursor = { x: t.clientX, y: t.clientY };
      const h = this.handler;

      // Tools that need immediate touch-start action
      if (this.tool === "grab") {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        h.onDown?.(world.x, world.y, t.clientX, t.clientY);
        this.touchToolFired = true;
      } else if (this.tool === "scale") {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        h.onDown?.(world.x, world.y, t.clientX, t.clientY);
        this.touchToolFired = true;
      } else if (this.isPlatformDrawTool()) {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        h.onDown?.(world.x, world.y, t.clientX, t.clientY);
        this.touchToolFired = true;
      } else if (this.isBrushTool()) {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.canvas);
        h.onDown?.(world.x, world.y, t.clientX, t.clientY);
        this.touchToolFired = true;
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    const cur = this.snapTouches(e);

    if (cur.length >= 2 && this.lastTouches.length >= 2) {
      // Two-finger gesture — cancel tool, do pan+zoom
      this.touchToolFired = true;
      this.grabTool.releaseGrab();
      this.scaleTool.scaleDrag = null;
      this.stopMultiPlace();
      const pt = this.platformTools.get(this.tool);
      if (pt) pt.platformDraw = null;

      const prevA = this.lastTouches[0];
      const prevB = this.lastTouches[1];
      const curA = cur[0];
      const curB = cur[1];

      const dx = (curA.x + curB.x - prevA.x - prevB.x) / 2;
      const dy = (curA.y + curB.y - prevA.y - prevB.y) / 2;
      this.game.camera.pan(dx, dy);

      const prevDist = this.touchDist(prevA, prevB);
      const curDist = this.touchDist(curA, curB);
      if (prevDist > 0) {
        const midX = (curA.x + curB.x) / 2;
        const midY = (curA.y + curB.y) / 2;
        this.game.camera.zoomAt(midX, midY, curDist / prevDist, this.game.canvas);
      }
    } else if (cur.length === 1 && this.lastTouches.length >= 1) {
      const t = cur[0];
      this.toolCursor = { x: t.x, y: t.y };
      const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
      const prev = this.lastTouches.find((lt) => lt.id === t.id) ?? this.lastTouches[0];
      const dx = t.x - prev.x;
      const dy = t.y - prev.y;

      const h = this.handler;

      if (this.tool === "grab" || this.tool === "scale") {
        h.onMove?.(world.x, world.y, dx, dy, t.x, t.y);
      } else if (this.isBrushTool()) {
        h.onBrush?.(world.x, world.y, t.x, t.y);
        this.touchToolFired = true;
      } else if (this.isPlatformDrawTool()) {
        h.onMove?.(world.x, world.y, dx, dy, t.x, t.y);
      } else if (this.multiPlaceInterval) {
        this.lastMouse = { x: t.x, y: t.y };
      } else if (this.multiPlace && this.handler.isCreationTool) {
        h.onDown?.(world.x, world.y, t.x, t.y);
        this.lastMouse = { x: t.x, y: t.y };
        this.startMultiPlace();
        this.touchToolFired = true;
      }
    }

    this.lastTouches = cur;
  }

  private onTouchEnd(e: TouchEvent) {
    // Single-finger tap — fire tool
    if (e.touches.length === 0 && this.lastTouches.length === 1 && !this.touchToolFired) {
      const t = this.lastTouches[0];
      const world = this.game.camera.toWorld(t.x, t.y, this.game.canvas);
      this.handler.onDown?.(world.x, world.y, t.x, t.y);
    }

    if (e.touches.length === 0) {
      this.handler.onUp?.();
      this.stopMultiPlace();
      this.toolCursor = null;
      this.grabTool.releaseGrab();
    }

    this.lastTouches = this.snapTouches(e);
  }

  // ── Multi-place ──

  private startMultiPlace() {
    if (!this.multiPlace || !this.handler.isCreationTool) return;
    this.stopMultiPlace();
    this.multiPlaceInterval = setInterval(() => {
      const world = this.game.camera.toWorld(this.lastMouse.x, this.lastMouse.y, this.game.canvas);
      this.handler.onDown?.(world.x, world.y, this.lastMouse.x, this.lastMouse.y);
    }, 100);
  }

  private stopMultiPlace() {
    if (this.multiPlaceInterval) {
      clearInterval(this.multiPlaceInterval);
      this.multiPlaceInterval = null;
    }
  }

  // ── Helpers ──

  private isBrushTool(): boolean {
    return this.tool === "erase" || this.tool === "glue" || this.tool === "unglue";
  }

  private isPlatformDrawTool(): boolean {
    return this.platformTools.has(this.tool);
  }

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
}
