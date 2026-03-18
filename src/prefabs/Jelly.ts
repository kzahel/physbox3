import type { Body } from "box2d3";
import { makeBody, makeCircle, makeShapeDef } from "../engine/BodyFactory";
import { createDistanceJoint, distance } from "../engine/Physics";
import type { PhysWorld } from "../engine/PhysWorld";

interface JellyOpts {
  fixedRotation: boolean;
  friction: number;
  edgeFill: string;
  innerFill: string;
  centerFill: string;
  perimFill: string;
}

const STICKY: JellyOpts = {
  fixedRotation: true,
  friction: 0.5,
  edgeFill: "rgba(80,220,80,0.85)",
  innerFill: "rgba(50,180,50,0.85)",
  centerFill: "rgba(50,180,50,0.85)",
  perimFill: "rgba(60,200,60,0.45)",
};

const SLIPPERY: JellyOpts = {
  fixedRotation: false,
  friction: 0.05,
  edgeFill: "rgba(80,180,255,0.85)",
  innerFill: "rgba(40,140,220,0.85)",
  centerFill: "rgba(40,140,220,0.85)",
  perimFill: "rgba(60,160,255,0.45)",
};

/** Sticky jelly — nodes don't rotate, high friction. */
export function createJelly(pw: PhysWorld, x: number, y: number): Body {
  return createJellyGrid(pw, x, y, STICKY);
}

/** Slippery jelly — nodes rotate freely, low friction. */
export function createSlimeJelly(pw: PhysWorld, x: number, y: number): Body {
  return createJellyGrid(pw, x, y, SLIPPERY);
}

function createJellyGrid(pw: PhysWorld, x: number, y: number, opts: JellyOpts): Body {
  const cols = 4;
  const rows = 6;
  const spacing = 0.4;
  const nodeRadius = 0.12;
  const hertz = 6;
  const dampingRatio = 0.2;

  const halfW = ((cols - 1) * spacing) / 2;
  const halfH = ((rows - 1) * spacing) / 2;

  const grid: Body[][] = [];
  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const bx = x - halfW + c * spacing;
      const by = y - halfH + r * spacing;
      const body = makeBody(pw, bx, by, { linearDamping: 0.3, fixedRotation: opts.fixedRotation });
      const shapeDef = makeShapeDef({ density: 1.5, friction: opts.friction, restitution: 0.1 });
      body.CreateCircleShape(shapeDef, makeCircle(nodeRadius));

      const isEdge = r === 0 || r === rows - 1 || c === 0 || c === cols - 1;
      pw.setUserData(body, {
        fill: isEdge ? opts.edgeFill : opts.innerFill,
        label: "jelly",
      });
      grid[r][c] = body;
    }
  }

  // Connect with springs: horizontal, vertical, and diagonal
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const a = grid[r][c];
      if (c + 1 < cols) link(pw, a, grid[r][c + 1], hertz, dampingRatio);
      if (r + 1 < rows) link(pw, a, grid[r + 1][c], hertz, dampingRatio);
      if (r + 1 < rows && c + 1 < cols) link(pw, a, grid[r + 1][c + 1], hertz, dampingRatio);
      if (r + 1 < rows && c - 1 >= 0) link(pw, a, grid[r + 1][c - 1], hertz, dampingRatio);
    }
  }

  // Build ordered perimeter: bottom→right→top→left
  const perimeter: Body[] = [];
  for (let c = 0; c < cols; c++) perimeter.push(grid[0][c]);
  for (let r = 1; r < rows; r++) perimeter.push(grid[r][cols - 1]);
  for (let c = cols - 2; c >= 0; c--) perimeter.push(grid[rows - 1][c]);
  for (let r = rows - 2; r >= 1; r--) perimeter.push(grid[r][0]);

  const center = grid[Math.floor(rows / 2)][Math.floor(cols / 2)];
  pw.setUserData(center, {
    fill: opts.centerFill,
    label: "jelly",
    jellyPerimeter: perimeter,
    jellyFill: opts.perimFill,
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
