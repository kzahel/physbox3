import { clamp } from "./Physics";

/** Anything with clientWidth/clientHeight — works with canvas or container div */
export interface Viewport {
  readonly clientWidth: number;
  readonly clientHeight: number;
}

export class Camera {
  x = 0;
  y = 0;
  zoom = 30; // pixels per meter (Planck uses meters)

  /** Convert world coords to screen (CSS pixel) coords */
  toScreen(wx: number, wy: number, viewport: Viewport): { x: number; y: number } {
    const cw = viewport.clientWidth;
    const ch = viewport.clientHeight;
    return {
      x: (wx - this.x) * this.zoom + cw / 2,
      y: -(wy - this.y) * this.zoom + ch / 2, // flip Y: Planck Y-up → screen Y-down
    };
  }

  /** Convert screen (CSS pixel) coords to world coords */
  toWorld(sx: number, sy: number, viewport: Viewport): { x: number; y: number } {
    const cw = viewport.clientWidth;
    const ch = viewport.clientHeight;
    return {
      x: (sx - cw / 2) / this.zoom + this.x,
      y: -(sy - ch / 2) / this.zoom + this.y,
    };
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom; // flip Y
  }

  zoomAt(sx: number, sy: number, factor: number, viewport: Viewport) {
    const before = this.toWorld(sx, sy, viewport);
    this.zoom *= factor;
    this.zoom = clamp(this.zoom, 1, 200);
    const after = this.toWorld(sx, sy, viewport);
    this.x -= after.x - before.x;
    this.y -= after.y - before.y;
  }
}
