import type * as planck from "planck";
import { ERASE_RADIUS_PX, GRAB_RADIUS_PX, type InputManager } from "../interaction/InputManager";
import type { Camera } from "./Camera";

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d")!;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    // Use clientWidth/Height to match actual CSS layout size (100vw/100vh)
    // window.innerWidth/Height can differ on mobile due to browser chrome
    this.canvas.width = this.canvas.clientWidth * dpr;
    this.canvas.height = this.canvas.clientHeight * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  clear() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawWorld(world: planck.World, camera: Camera) {
    this.clear();
    const ctx = this.ctx;

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const pos = body.getPosition();
      const angle = body.getAngle();

      for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
        const shape = fixture.getShape();
        const userData = fixture.getUserData() as FixtureStyle | null;
        const isSensor = fixture.isSensor();

        ctx.save();

        // Transform to screen space
        const screen = camera.toScreen(pos.x, pos.y, this.canvas);
        ctx.translate(screen.x, screen.y);
        ctx.rotate(-angle); // flip rotation for Y-flip
        ctx.scale(camera.zoom, -camera.zoom); // scale + flip Y

        // Style
        const fillColor = userData?.fill ?? this.bodyColor(body);
        const strokeColor = userData?.stroke ?? "rgba(255,255,255,0.3)";
        ctx.fillStyle = isSensor ? "rgba(100,200,255,0.15)" : fillColor;
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 1 / camera.zoom;

        if (shape.getType() === "circle") {
          const circle = shape as planck.CircleShape;
          const r = circle.getRadius();
          const center = circle.getCenter();
          ctx.beginPath();
          ctx.arc(center.x, center.y, r, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Spoke for rotation
          ctx.beginPath();
          ctx.moveTo(center.x, center.y);
          ctx.lineTo(center.x + r, center.y);
          ctx.stroke();
        } else if (shape.getType() === "polygon") {
          const poly = shape as planck.PolygonShape;
          const verts = poly.m_vertices;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        } else if (shape.getType() === "edge") {
          const edge = shape as planck.EdgeShape;
          ctx.beginPath();
          ctx.moveTo(edge.m_vertex1.x, edge.m_vertex1.y);
          ctx.lineTo(edge.m_vertex2.x, edge.m_vertex2.y);
          ctx.stroke();
        } else if (shape.getType() === "chain") {
          const chain = shape as planck.ChainShape;
          const verts = chain.m_vertices;
          ctx.beginPath();
          ctx.moveTo(verts[0].x, verts[0].y);
          for (let i = 1; i < verts.length; i++) {
            ctx.lineTo(verts[i].x, verts[i].y);
          }
          ctx.stroke();
        }

        ctx.restore();
      }
    }

    // Draw joints
    this.drawJoints(world, camera);

    // Draw tool cursor overlay
    if (this.inputManager?.toolCursor) {
      const tool = this.inputManager.tool;
      const pos = this.inputManager.toolCursor;
      if (tool === "erase") {
        this.drawToolCursor(pos, ERASE_RADIUS_PX, "rgba(255, 80, 80, 0.7)", "rgba(255, 80, 80, 0.1)");
      } else if (tool === "grab") {
        this.drawToolCursor(pos, GRAB_RADIUS_PX, "rgba(100, 200, 255, 0.5)", "rgba(100, 200, 255, 0.05)");
      }
    }
  }

  setInputManager(input: InputManager) {
    this.inputManager = input;
  }

  private inputManager: InputManager | null = null;

  private drawToolCursor(pos: { x: number; y: number }, radius: number, stroke: string, fill: string) {
    const ctx = this.ctx;
    ctx.save();
    // Reset to CSS-pixel identity so screen coords map correctly
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawJoints(world: planck.World, camera: Camera) {
    const ctx = this.ctx;
    ctx.strokeStyle = "rgba(150,200,255,0.4)";
    ctx.lineWidth = 1;

    for (let joint = world.getJointList(); joint; joint = joint.getNext()) {
      const a = joint.getAnchorA();
      const b = joint.getAnchorB();
      const sa = camera.toScreen(a.x, a.y, this.canvas);
      const sb = camera.toScreen(b.x, b.y, this.canvas);

      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      ctx.stroke();

      // Anchor dots
      ctx.fillStyle = "rgba(150,200,255,0.6)";
      ctx.beginPath();
      ctx.arc(sa.x, sa.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(sb.x, sb.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private bodyColor(body: planck.Body): string {
    if (body.isStatic()) return "rgba(80,80,100,0.8)";
    if (body.isKinematic()) return "rgba(100,180,100,0.6)";
    const ud = body.getUserData() as BodyStyle | null;
    return ud?.fill ?? "rgba(120,160,255,0.6)";
  }
}

export interface FixtureStyle {
  fill?: string;
  stroke?: string;
}

export interface BodyStyle {
  fill?: string;
  label?: string;
}
