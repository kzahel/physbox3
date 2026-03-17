/** Compute a zigzag spring coil path between two points. */
export function computeSpringCoilPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  coils: number,
  amplitude: number,
): { x: number; y: number }[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return [a, b];

  const nx = -dy / len;
  const ny = dx / len;

  const points: { x: number; y: number }[] = [{ x: a.x, y: a.y }];
  for (let i = 1; i <= coils * 2; i++) {
    const t = i / (coils * 2 + 1);
    const side = i % 2 === 1 ? 1 : -1;
    points.push({
      x: a.x + dx * t + nx * amplitude * side,
      y: a.y + dy * t + ny * amplitude * side,
    });
  }
  points.push({ x: b.x, y: b.y });
  return points;
}
