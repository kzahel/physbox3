import type * as planck from "planck";
import { ERASE_RADIUS_PX, GRAB_RADIUS_PX, type InputManager } from "../interaction/InputManager";
import type { Camera } from "./Camera";
import { KILL_Y } from "./Game";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  r: number;
  g: number;
  b: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  private canvas: HTMLCanvasElement;
  private particles: Particle[] = [];
  private lastTime = 0;

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

    // Draw ocean at kill floor
    this.drawOcean(camera);

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

    // Conveyor belt animation
    this.drawConveyorAnimation(world, camera);

    // Dynamite wick + sparks
    this.drawDynamiteEffects(world, camera);

    // Particles
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;
    this.updateParticles(dt);
    this.drawParticles(camera);

    // Draw tool cursor overlay
    if (this.inputManager?.toolCursor) {
      const tool = this.inputManager.tool;
      const pos = this.inputManager.toolCursor;
      if (tool === "erase") {
        this.drawToolCursor(pos, ERASE_RADIUS_PX, "rgba(255, 80, 80, 0.7)", "rgba(255, 80, 80, 0.1)");
      } else if (tool === "grab") {
        this.drawToolCursor(pos, GRAB_RADIUS_PX, "rgba(100, 200, 255, 0.5)", "rgba(100, 200, 255, 0.05)");
      } else if (tool === "attach") {
        this.drawToolCursor(pos, 10, "rgba(255, 200, 50, 0.6)", "rgba(255, 200, 50, 0.05)");
      } else if (tool === "detach") {
        this.drawToolCursor(pos, 10, "rgba(255, 100, 50, 0.6)", "rgba(255, 100, 50, 0.05)");
      } else if (tool === "attract") {
        this.drawToolCursor(pos, 10, "rgba(50, 255, 150, 0.6)", "rgba(50, 255, 150, 0.05)");
      } else if (tool === "ropetool") {
        this.drawToolCursor(pos, 10, "rgba(180, 160, 120, 0.6)", "rgba(180, 160, 120, 0.05)");
      }
    }

    // Draw platform/conveyor preview
    if (this.inputManager?.platformDraw) {
      const isConveyor = this.inputManager.tool === "conveyor";
      const { start, end } = this.inputManager.platformDraw;
      const s = camera.toScreen(start.x, start.y, this.canvas);
      const e = camera.toScreen(end.x, end.y, this.canvas);
      const ctx = this.ctx;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(e.x, e.y);
      ctx.strokeStyle = isConveyor ? "rgba(200, 160, 50, 0.9)" : "rgba(80, 100, 80, 0.9)";
      ctx.lineWidth = Math.max(4, (isConveyor ? 0.4 : 0.3) * camera.zoom);
      ctx.lineCap = "round";
      ctx.setLineDash([8, 6]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Endpoint dots
      ctx.fillStyle = isConveyor ? "rgba(200, 160, 50, 0.8)" : "rgba(120, 160, 120, 0.8)";
      for (const p of [s, e]) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Draw rope pending highlight
    if (this.inputManager?.ropePending) {
      const rp = this.inputManager.ropePending;
      const sp = rp.body
        ? camera.toScreen(rp.body.getPosition().x, rp.body.getPosition().y, this.canvas)
        : camera.toScreen(rp.x, rp.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(180, 160, 120, 0.9)", "rgba(180, 160, 120, 0.15)");
    }

    // Draw attach pending highlight
    if (this.inputManager?.attachPending) {
      const body = this.inputManager.attachPending.body;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      this.drawToolCursor(sp, 16, "rgba(255, 200, 50, 0.9)", "rgba(255, 200, 50, 0.15)");
    }

    // Draw select tool UI
    if (this.inputManager?.selectedBody) {
      const body = this.inputManager.selectedBody;
      const bpos = body.getPosition();
      const sp = camera.toScreen(bpos.x, bpos.y, this.canvas);
      // Selection highlight ring
      this.drawToolCursor(sp, 20, "rgba(100, 200, 255, 0.8)", "rgba(100, 200, 255, 0.08)");
      // Toggle button above body
      this.drawToggleButton(sp, body.isStatic());
      // Direction button for cars/conveyors
      let nextBtnY = 55;
      if (this.inputManager.isDirectional(body)) {
        this.drawDirectionButton(sp, nextBtnY);
        nextBtnY += 25;
      }
      // Motor button
      this.drawMotorButton(sp, nextBtnY, this.inputManager.hasMotor(body));
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

  private drawDirectionButton(bodyScreen: { x: number; y: number }, offsetY = 55) {
    const ctx = this.ctx;
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const x = bodyScreen.x;
    const y = bodyScreen.y - offsetY;

    // Pill button
    const w = 38;
    const h = 18;
    ctx.beginPath();
    ctx.roundRect(x - w, y - h / 2, w * 2, h, h / 2);
    ctx.fillStyle = "rgba(100, 140, 255, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Reverse arrows ⇄
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("\u21C4 Flip", x, y);

    ctx.restore();
  }

  private drawMotorButton(bodyScreen: { x: number; y: number }, offsetY: number, active: boolean) {
    const ctx = this.ctx;
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const x = bodyScreen.x;
    const y = bodyScreen.y - offsetY;

    const w = 38;
    const h = 18;
    ctx.beginPath();
    ctx.roundRect(x - w, y - h / 2, w * 2, h, h / 2);
    ctx.fillStyle = active ? "rgba(255, 160, 50, 0.85)" : "rgba(120, 120, 140, 0.85)";
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(active ? "\u2699 Motor" : "\u2699 Motor", x, y);

    ctx.restore();
  }

  private drawOcean(camera: Camera) {
    const ctx = this.ctx;
    const cw = this.canvas.clientWidth;
    const ch = this.canvas.clientHeight;
    const surface = camera.toScreen(0, KILL_Y, this.canvas);

    // Only draw if ocean surface is visible
    if (surface.y > ch) return;

    const top = Math.max(0, surface.y);

    // Water body
    ctx.fillStyle = "rgba(20, 60, 120, 0.4)";
    ctx.fillRect(0, top, cw, ch - top);

    // Surface line with wave effect
    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = Math.sin(wx * 0.8) * 2 + Math.sin(wx * 1.5) * 1;
      const sy = camera.toScreen(0, KILL_Y + wave, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.lineTo(cw, ch);
    ctx.lineTo(0, ch);
    ctx.closePath();
    ctx.fillStyle = "rgba(30, 80, 160, 0.3)";
    ctx.fill();

    // Surface highlight
    ctx.beginPath();
    ctx.moveTo(0, surface.y);
    for (let x = 0; x <= cw; x += 4) {
      const wx = (x - cw / 2) / camera.zoom + camera.x;
      const wave = Math.sin(wx * 0.8) * 2 + Math.sin(wx * 1.5) * 1;
      const sy = camera.toScreen(0, KILL_Y + wave, this.canvas).y;
      ctx.lineTo(x, sy);
    }
    ctx.strokeStyle = "rgba(100, 180, 255, 0.5)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  private drawConveyorAnimation(world: planck.World, camera: Camera) {
    const ctx = this.ctx;
    const time = performance.now() / 1000;

    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; speed?: number } | null;
      if (ud?.label !== "conveyor") continue;

      const speed = ud.speed ?? 3;
      const pos = body.getPosition();
      const angle = body.getAngle();

      // Get conveyor half-width from first fixture
      const fixture = body.getFixtureList();
      if (!fixture) continue;
      const shape = fixture.getShape() as planck.PolygonShape;
      const hw = Math.abs(shape.m_vertices[0].x); // half-width

      ctx.save();
      const screen = camera.toScreen(pos.x, pos.y, this.canvas);
      ctx.translate(screen.x, screen.y);
      ctx.rotate(-angle);

      // Animated chevrons along the belt surface
      const spacing = 0.8; // world units between chevrons
      const offset = (time * speed) % spacing;
      const count = Math.ceil((hw * 2) / spacing) + 1;
      const chevronSize = 0.15 * camera.zoom;

      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.lineWidth = Math.max(1, 0.06 * camera.zoom);
      ctx.lineCap = "round";

      for (let i = 0; i < count; i++) {
        const lx = (-hw + offset + i * spacing) * camera.zoom;
        if (Math.abs(lx) > hw * camera.zoom) continue;
        const ly = 0;
        // Draw chevron pointing in speed direction
        const dir = speed > 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(lx - chevronSize * dir, ly - chevronSize);
        ctx.lineTo(lx, ly);
        ctx.lineTo(lx - chevronSize * dir, ly + chevronSize);
        ctx.stroke();
      }

      ctx.restore();
    }
  }

  spawnExplosion(wx: number, wy: number) {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      const speed = 2 + Math.random() * 6;
      const life = 0.4 + Math.random() * 0.6;
      const isSmoke = Math.random() < 0.3;
      this.particles.push({
        x: wx,
        y: wy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: isSmoke ? 0.3 + Math.random() * 0.4 : 0.1 + Math.random() * 0.2,
        r: isSmoke ? 80 : 255,
        g: isSmoke ? 80 : 100 + Math.floor(Math.random() * 155),
        b: isSmoke ? 80 : 0,
      });
    }
  }

  spawnFlame(wx: number, wy: number, bodyAngle: number) {
    // Exhaust direction is opposite to rocket's "up"
    const exDirX = Math.sin(bodyAngle);
    const exDirY = -Math.cos(bodyAngle);
    for (let i = 0; i < 2; i++) {
      const spread = (Math.random() - 0.5) * 1.5;
      const speed = 3 + Math.random() * 4;
      const life = 0.15 + Math.random() * 0.25;
      const isSmoke = Math.random() < 0.2;
      this.particles.push({
        x: wx + (Math.random() - 0.5) * 0.2,
        y: wy + (Math.random() - 0.5) * 0.2,
        vx: exDirX * speed + spread,
        vy: exDirY * speed + spread,
        life,
        maxLife: life,
        size: isSmoke ? 0.2 + Math.random() * 0.3 : 0.08 + Math.random() * 0.12,
        r: isSmoke ? 100 : 255,
        g: isSmoke ? 100 : 150 + Math.floor(Math.random() * 105),
        b: isSmoke ? 100 : 0,
      });
    }
  }

  spawnSpark(wx: number, wy: number) {
    for (let i = 0; i < 3; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.5 + Math.random() * 1.5;
      this.particles.push({
        x: wx + (Math.random() - 0.5) * 0.1,
        y: wy + (Math.random() - 0.5) * 0.1,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 1,
        life: 0.2 + Math.random() * 0.3,
        maxLife: 0.5,
        size: 0.05 + Math.random() * 0.08,
        r: 255,
        g: 200 + Math.floor(Math.random() * 55),
        b: 50,
      });
    }
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.97;
      p.vy *= 0.97;
    }
  }

  private drawParticles(camera: Camera) {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const sp = camera.toScreen(p.x, p.y, this.canvas);
      const alpha = p.life / p.maxLife;
      const r = p.size * camera.zoom;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, Math.max(1, r), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${p.r},${p.g},${p.b},${alpha.toFixed(2)})`;
      ctx.fill();
    }
  }

  private drawDynamiteEffects(world: planck.World, camera: Camera) {
    const now = performance.now();
    for (let body = world.getBodyList(); body; body = body.getNext()) {
      const ud = body.getUserData() as { label?: string; fuseStart?: number; fuseDuration?: number } | null;
      if (ud?.label !== "dynamite" || !ud.fuseStart || !ud.fuseDuration) continue;

      const elapsed = (now - ud.fuseStart) / 1000;
      const remaining = Math.max(0, 1 - elapsed / ud.fuseDuration);

      const pos = body.getPosition();
      const angle = body.getAngle();
      const ctx = this.ctx;

      // Wick: starts at top of dynamite, shrinks
      const wickBaseX = pos.x + Math.sin(-angle) * 0.4;
      const wickBaseY = pos.y + Math.cos(-angle) * 0.4;
      const wickLen = 0.5 * remaining;
      const wickEndX = wickBaseX + Math.sin(-angle) * wickLen;
      const wickEndY = wickBaseY + Math.cos(-angle) * wickLen;

      const wbSp = camera.toScreen(wickBaseX, wickBaseY, this.canvas);
      const weSp = camera.toScreen(wickEndX, wickEndY, this.canvas);

      ctx.beginPath();
      ctx.moveTo(wbSp.x, wbSp.y);
      ctx.lineTo(weSp.x, weSp.y);
      ctx.strokeStyle = "rgba(80,60,40,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Spark at wick tip
      if (remaining > 0) {
        this.spawnSpark(wickEndX, wickEndY);
        // Glow at tip
        ctx.beginPath();
        ctx.arc(weSp.x, weSp.y, 4 + Math.random() * 3, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,${150 + Math.floor(Math.random() * 100)},50,${0.5 + Math.random() * 0.3})`;
        ctx.fill();
      }
    }
  }

  private drawToggleButton(bodyScreen: { x: number; y: number }, isStatic: boolean) {
    const ctx = this.ctx;
    ctx.save();
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const x = bodyScreen.x;
    const y = bodyScreen.y - 30;
    const label = isStatic ? "Fixed" : "Free";
    const bg = isStatic ? "rgba(200, 80, 80, 0.85)" : "rgba(80, 160, 80, 0.85)";

    // Pill button
    const w = 38;
    const h = 18;
    ctx.beginPath();
    ctx.roundRect(x - w, y - h / 2, w * 2, h, h / 2);
    ctx.fillStyle = bg;
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, x, y);

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
