import type { Body } from "box2d3";
import { b2 } from "../engine/Box2D";
import type { Game } from "../engine/Game";
import { distance, findClosestBody } from "../engine/Physics";
import { RagdollController } from "./RagdollController";
import type { Tool, ToolContext, ToolHandler, ToolRenderInfo } from "./ToolHandler";
import { AttachTool } from "./tools/AttachTool";
import { AttractTool } from "./tools/AttractTool";
import { CreationTool } from "./tools/CreationTool";
import { DetachTool } from "./tools/DetachTool";
import { DrawTool } from "./tools/DrawTool";
import { EraseTool } from "./tools/EraseTool";
import { FluidParticleTool } from "./tools/FluidParticleTool";
import { GlueTool, UnGlueTool } from "./tools/GlueTool";
import { GrabTool } from "./tools/GrabTool";
import { PlatformDrawTool } from "./tools/PlatformDrawTool";
import { RopeTool, SpringTool } from "./tools/RopeTool";
import { SandTool } from "./tools/SandTool";
import { ScaleTool } from "./tools/ScaleTool";
import { SelectTool } from "./tools/SelectTool";
import { TerrainTool } from "./tools/TerrainTool";

// Re-export Tool type that other modules need
export type { Tool, ToolRenderInfo } from "./ToolHandler";

const PAN_SPEED = 8;
const WASD_DIRECTIONS: [string, number, number][] = [
  ["w", 0, 1],
  ["W", 0, 1],
  ["s", 0, -1],
  ["S", 0, -1],
  ["a", -1, 0],
  ["A", -1, 0],
  ["d", 1, 0],
  ["D", 1, 0],
];

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
  "train",
  "jelly",
  "slime",
];

const PLATFORM_TOOL_IDS: Tool[] = ["platform", "conveyor", "fan", "cannon", "rocket"];

export class InputManager implements ToolRenderInfo {
  tool: Tool = "grab";

  // Multi-placement mode
  multiPlace = false;
  private multiPlaceInterval: ReturnType<typeof setInterval> | null = null;

  // Tool cursor position (screen coords, null when not active)
  toolCursor: { x: number; y: number } | null = null;

  // Keyboard state
  private keys = new Set<string>();
  private game: Game;
  private groundBody: Body;

  // Pan state
  private isPanning = false;
  private lastMouse = { x: 0, y: 0 };

  // Touch state
  private lastTouches: { id: number; x: number; y: number }[] = [];
  private touchToolFired = false;
  /** Stored so the pan loop can be cancelled on cleanup */
  panRAF = 0;

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
  readonly drawTool: DrawTool;
  readonly terrainTool: TerrainTool;
  readonly platformTools: Map<Tool, PlatformDrawTool>;

  onToolChange?: (tool: Tool) => void;

  constructor(game: Game) {
    this.game = game;
    // Create a static ground body for tools that need an anchor (GrabTool MotorJoint)
    const B2 = b2();
    const groundDef = B2.b2DefaultBodyDef();
    groundDef.type = B2.b2BodyType.b2_staticBody;
    this.groundBody = game.pw.createBody(groundDef);

    const ctx: ToolContext = {
      game,
      groundBody: this.groundBody,
      findBodyAt: (wx, wy, radiusPx) => this.findBodyAt(wx, wy, radiusPx),
    };

    // Create tool handlers
    this.grabTool = new GrabTool(ctx);
    this.attachTool = new AttachTool(ctx);
    this.ropeTool = new RopeTool(ctx);
    this.springTool = new SpringTool(ctx);
    this.attractTool = new AttractTool(ctx);
    this.selectTool = new SelectTool(ctx);
    this.scaleTool = new ScaleTool(ctx);
    this.drawTool = new DrawTool(ctx);
    this.terrainTool = new TerrainTool(ctx);

    // Platform-draw family
    this.platformTools = new Map<Tool, PlatformDrawTool>(
      PLATFORM_TOOL_IDS.map((t) => [t, new PlatformDrawTool(ctx, t)]),
    );

    // Build handlers map: individual tools + platform tools + creation tools
    const h: Partial<Record<Tool, ToolHandler>> = {
      grab: this.grabTool,
      erase: new EraseTool(ctx),
      glue: new GlueTool(ctx),
      unglue: new UnGlueTool(ctx),
      attach: this.attachTool,
      detach: new DetachTool(ctx),
      ropetool: this.ropeTool,
      spring: this.springTool,
      attract: this.attractTool,
      select: this.selectTool,
      scale: this.scaleTool,
      draw: this.drawTool,
      terrain: this.terrainTool,
      fluid: new FluidParticleTool(ctx),
      sand: new SandTool(ctx),
    };
    for (const [id, tool] of this.platformTools) h[id] = tool;
    for (const t of CREATION_TOOL_IDS) h[t] = new CreationTool(ctx, t);
    this.handlers = h as Record<Tool, ToolHandler>;

    this.ragdollController = new RagdollController(game, this.keys);
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

  get ropePending(): { body: Body | null; x: number; y: number } | null {
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

  get drawPoints(): readonly { x: number; y: number }[] {
    return this.drawTool.drawPoints;
  }

  get terrainPoints(): readonly { x: number; y: number }[] {
    return this.terrainTool.terrainPoints;
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
    this.grabTool.update();
  }

  resetGroundBody() {
    const B2 = b2();
    const groundDef = B2.b2DefaultBodyDef();
    groundDef.type = B2.b2BodyType.b2_staticBody;
    this.groundBody = this.game.pw.createBody(groundDef);
    // Update context for all handlers — handlers store a reference to the ctx object
    // which has groundBody as a property, so we update the shared ctx
    const ctx = (this.grabTool as unknown as { ctx: ToolContext }).ctx;
    ctx.groundBody = this.groundBody;
  }

  // ── Event binding ──

  private bind() {
    const el = this.game.container;

    el.addEventListener("mousedown", (e) => this.onMouseDown(e));
    el.addEventListener("mousemove", (e) => this.onMouseMove(e));
    el.addEventListener("mouseup", (e) => this.onMouseUp(e));
    el.addEventListener("wheel", (e) => this.onWheel(e as WheelEvent), { passive: false });
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    el.addEventListener("touchstart", (e) => this.onTouchStart(e as TouchEvent), { passive: false });
    el.addEventListener("touchmove", (e) => this.onTouchMove(e as TouchEvent), { passive: false });
    el.addEventListener("touchend", (e) => this.onTouchEnd(e as TouchEvent));
    el.addEventListener("touchcancel", (e) => this.onTouchEnd(e as TouchEvent));

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
    const tick = () => {
      for (const [key, dx, dy] of WASD_DIRECTIONS) {
        if (this.keys.has(key)) {
          this.game.camera.x += (dx * PAN_SPEED) / this.game.camera.zoom;
          this.game.camera.y += (dy * PAN_SPEED) / this.game.camera.zoom;
        }
      }
      this.panRAF = requestAnimationFrame(tick);
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

    const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.container);
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

    const world = this.game.camera.toWorld(e.clientX, e.clientY, this.game.container);
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
    this.game.camera.zoomAt(e.clientX, e.clientY, factor, this.game.container);
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
    return distance(a, b);
  }

  private onTouchStart(e: TouchEvent) {
    e.preventDefault();
    this.lastTouches = this.snapTouches(e);
    this.touchToolFired = false;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      this.toolCursor = { x: t.clientX, y: t.clientY };

      if (this.handler.immediateTouch) {
        const world = this.game.camera.toWorld(t.clientX, t.clientY, this.game.container);
        this.handler.onDown?.(world.x, world.y, t.clientX, t.clientY);
        this.touchToolFired = true;
      }
    }
  }

  private onTouchMove(e: TouchEvent) {
    e.preventDefault();
    const cur = this.snapTouches(e);

    if (cur.length >= 2 && this.lastTouches.length >= 2) {
      this.handleTwoFingerGesture(cur);
    } else if (cur.length === 1 && this.lastTouches.length >= 1) {
      this.handleSingleFingerDrag(cur[0]);
    }

    this.lastTouches = cur;
  }

  private handleTwoFingerGesture(cur: { id: number; x: number; y: number }[]) {
    this.touchToolFired = true;
    this.handler.reset?.();
    this.stopMultiPlace();

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
      this.game.camera.zoomAt(midX, midY, curDist / prevDist, this.game.container);
    }
  }

  private handleSingleFingerDrag(t: { id: number; x: number; y: number }) {
    this.toolCursor = { x: t.x, y: t.y };
    const world = this.game.camera.toWorld(t.x, t.y, this.game.container);
    const prev = this.lastTouches.find((lt) => lt.id === t.id) ?? this.lastTouches[0];
    const dx = t.x - prev.x;
    const dy = t.y - prev.y;

    const h = this.handler;
    const dragMode = h.touchDragMode;

    if (dragMode === "drag") {
      h.onMove?.(world.x, world.y, dx, dy, t.x, t.y);
    } else if (dragMode === "brush") {
      h.onBrush?.(world.x, world.y, t.x, t.y);
      this.touchToolFired = true;
    } else if (this.multiPlaceInterval) {
      this.lastMouse = { x: t.x, y: t.y };
    } else if (this.multiPlace && h.isCreationTool) {
      h.onDown?.(world.x, world.y, t.x, t.y);
      this.lastMouse = { x: t.x, y: t.y };
      this.startMultiPlace();
      this.touchToolFired = true;
    }
  }

  private onTouchEnd(e: TouchEvent) {
    // Single-finger tap — fire tool
    if (e.touches.length === 0 && this.lastTouches.length === 1 && !this.touchToolFired) {
      const t = this.lastTouches[0];
      const world = this.game.camera.toWorld(t.x, t.y, this.game.container);
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
      const world = this.game.camera.toWorld(this.lastMouse.x, this.lastMouse.y, this.game.container);
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

  private findBodyAt(wx: number, wy: number, radiusPx = 10): Body | null {
    const radius = radiusPx / this.game.camera.zoom;
    return findClosestBody(this.game.pw, wx, wy, radius);
  }
}
