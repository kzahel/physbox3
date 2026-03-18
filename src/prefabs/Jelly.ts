import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { createDistanceJoint, distance } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

/** Create a rectangular jelly (soft body) — a grid of bodies linked by spring joints. */
export function createJelly(pw: PhysWorld, x: number, y: number): Body {
  const cols = 4;
  const rows = 6;
  const spacing = 0.4;
  const nodeRadius = 0.12;
  const hertz = 6;
  const dampingRatio = 0.2;

  // Half-extents for centering
  const halfW = ((cols - 1) * spacing) / 2;
  const halfH = ((rows - 1) * spacing) / 2;

  // Create grid of bodies
  const grid: Body[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const bx = x - halfW + c * spacing;
      const by = y - halfH + r * spacing;
      const body = makeBody(pw, bx, by, { linearDamping: 0.3 });
      const shapeDef = makeShapeDef({ density: 1.5, friction: 0.5, restitution: 0.1 });
      body.CreateCircleShape(shapeDef, makeCircle(nodeRadius));

      // Edge nodes slightly brighter green
      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      pw.setUserData(body, {
        fill: isEdge ? "rgba(80,220,80,0.85)" : "rgba(50,180,50,0.85)",
        label: "jelly",
      });
      grid[r][c] = body;
    }
  }

  // Connect with springs: horizontal, vertical, and diagonal
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = grid[r][c];

      // Right neighbor
      if (c + 1 < cols) {
        link(pw, a, grid[r][c + 1], hertz, dampingRatio);
      }
      // Down neighbor
      if (r + 1 < rows) {
        link(pw, a, grid[r + 1][c], hertz, dampingRatio);
      }
      // Diagonal down-right
      if (r + 1 < rows && c + 1 < cols) {
        link(pw, a, grid[r + 1][c + 1], hertz, dampingRatio);
      }
      // Diagonal down-left
      if (r + 1 < rows && c - 1 >= 0) {
        link(pw, a, grid[r + 1][c - 1], hertz, dampingRatio);
      }
    }
  }

  // Build ordered perimeter: bottom→right→top→left
  const perimeter: Body[] = [];
  for (let c = 0; c < cols; c++) perimeter.push(grid[0][c]); // bottom row L→R
  for (let r = 1; r < rows; r++) perimeter.push(grid[r][cols - 1]); // right col up
  for (let c = cols - 2; c >= 0; c--) perimeter.push(grid[rows - 1][c]); // top row R→L
  for (let r = rows - 2; r >= 1; r--) perimeter.push(grid[r][0]); // left col down

  // Store perimeter on center body for rendering
  const center = grid[Math.floor(rows / 2)][Math.floor(cols / 2)];
  pw.setUserData(center, {
    fill: "rgba(50,180,50,0.85)",
    label: "jelly",
    jellyPerimeter: perimeter,
  });

  return center;
}

function link(pw: PhysWorld, a: Body, b: Body, hertz: number, dampingRatio: number) {
  const aPos = a.GetPosition();
  const bPos = b.GetPosition();
  const len = distance(aPos, bPos);
  const jh = createDistanceJoint(
    pw,
    a,
    b,
    { x: aPos.x, y: aPos.y },
    { x: bPos.x, y: bPos.y },
    {
      length: len,
      enableSpring: true,
      hertz,
      dampingRatio,
      collideConnected: false,
    },
  );
  pw.setJointData(jh, { hidden: true });
}
