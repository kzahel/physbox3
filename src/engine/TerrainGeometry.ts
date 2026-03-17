/** Compute the closed fill polygon for a terrain surface. */
export function computeTerrainFillPath(
  terrainPoints: readonly { x: number; y: number }[],
): { x: number; y: number }[] | null {
  if (terrainPoints.length < 2) return null;

  let minY = Infinity;
  for (const p of terrainPoints) minY = Math.min(minY, p.y);

  const path: { x: number; y: number }[] = [];
  for (const p of terrainPoints) path.push({ x: p.x, y: p.y });
  path.push({ x: terrainPoints[terrainPoints.length - 1].x, y: minY });
  path.push({ x: terrainPoints[0].x, y: minY });
  return path;
}
