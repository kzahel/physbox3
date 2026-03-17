/** Generate a random HSLA body color. */
export function randomBodyColor(satBase = 50, satRange = 40, litBase = 40, litRange = 25, alpha = 0.85): string {
  const hue = Math.floor(Math.random() * 360);
  const sat = satBase + Math.floor(Math.random() * satRange);
  const lit = litBase + Math.floor(Math.random() * litRange);
  return `hsla(${hue},${sat}%,${lit}%,${alpha})`;
}

// ── Color parsing (used by ThreeJSRenderer) ──

const _colorCtx = document.createElement("canvas").getContext("2d")!;

/** Parse any CSS color string into normalized RGBA components (0–1). */
export function parseColor(color: string): { r: number; g: number; b: number; a: number } {
  _colorCtx.clearRect(0, 0, 1, 1);
  _colorCtx.fillStyle = color;
  _colorCtx.fillRect(0, 0, 1, 1);
  const d = _colorCtx.getImageData(0, 0, 1, 1).data;
  return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
}

/** Extract the alpha component from a CSS color string. */
export function colorOpacity(color: string): number {
  return parseColor(color).a;
}
