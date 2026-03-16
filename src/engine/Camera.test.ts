import { describe, expect, it } from "vitest";
import { Camera } from "./Camera";

function makeCanvas(w: number, h: number) {
  return { width: w, height: h } as HTMLCanvasElement;
}

describe("Camera", () => {
  it("toScreen converts world origin to canvas center", () => {
    const cam = new Camera();
    const canvas = makeCanvas(800, 600);
    const s = cam.toScreen(0, 0, canvas);
    expect(s.x).toBe(400);
    expect(s.y).toBe(300);
  });

  it("toWorld converts canvas center to world origin", () => {
    const cam = new Camera();
    const canvas = makeCanvas(800, 600);
    const w = cam.toWorld(400, 300, canvas);
    expect(w.x).toBeCloseTo(0);
    expect(w.y).toBeCloseTo(0);
  });

  it("toScreen and toWorld are inverses", () => {
    const cam = new Camera();
    cam.x = 5;
    cam.y = -3;
    cam.zoom = 50;
    const canvas = makeCanvas(1024, 768);

    const wx = 7.5,
      wy = -1.2;
    const s = cam.toScreen(wx, wy, canvas);
    const back = cam.toWorld(s.x, s.y, canvas);
    expect(back.x).toBeCloseTo(wx);
    expect(back.y).toBeCloseTo(wy);
  });

  it("pan moves camera position", () => {
    const cam = new Camera();
    cam.zoom = 30;
    cam.pan(60, 0); // 60px right on screen → camera moves left in world
    expect(cam.x).toBeCloseTo(-2); // 60 / 30 = 2
  });

  it("zoomAt changes zoom level", () => {
    const cam = new Camera();
    const canvas = makeCanvas(800, 600);
    const before = cam.zoom;
    cam.zoomAt(400, 300, 1.5, canvas);
    expect(cam.zoom).toBe(before * 1.5);
  });

  it("zoom clamps to min/max", () => {
    const cam = new Camera();
    const canvas = makeCanvas(800, 600);
    cam.zoomAt(400, 300, 0.01, canvas); // try to zoom way out
    expect(cam.zoom).toBe(5);
    cam.zoom = 30;
    cam.zoomAt(400, 300, 100, canvas); // try to zoom way in
    expect(cam.zoom).toBe(200);
  });
});
