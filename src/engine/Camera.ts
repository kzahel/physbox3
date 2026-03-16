export class Camera {
  x = 0;
  y = 0;
  zoom = 30; // pixels per meter (Planck uses meters)

  /** Convert world coords to screen (CSS pixel) coords */
  toScreen(wx: number, wy: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    return {
      x: (wx - this.x) * this.zoom + cw / 2,
      y: -(wy - this.y) * this.zoom + ch / 2, // flip Y: Planck Y-up → screen Y-down
    };
  }

  /** Convert screen (CSS pixel) coords to world coords */
  toWorld(sx: number, sy: number, canvas: HTMLCanvasElement): { x: number; y: number } {
    const cw = canvas.clientWidth;
    const ch = canvas.clientHeight;
    return {
      x: (sx - cw / 2) / this.zoom + this.x,
      y: -(sy - ch / 2) / this.zoom + this.y,
    };
  }

  pan(dx: number, dy: number) {
    this.x -= dx / this.zoom;
    this.y += dy / this.zoom; // flip Y
  }

  zoomAt(sx: number, sy: number, factor: number, canvas: HTMLCanvasElement) {
    const before = this.toWorld(sx, sy, canvas);
    this.zoom *= factor;
    this.zoom = Math.max(5, Math.min(200, this.zoom));
    const after = this.toWorld(sx, sy, canvas);
    this.x -= after.x - before.x;
    this.y -= after.y - before.y;
  }
}
