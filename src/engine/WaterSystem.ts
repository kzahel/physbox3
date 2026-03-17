import type { Body, b2ShapeId } from "box2d3";
import { b2 } from "./Box2D";
import { isDynamic } from "./Physics";
import type { PhysWorld } from "./PhysWorld";

/**
 * Column-based water simulation. Water is a heightfield: an array of vertical
 * columns, each storing a water level (top surface Y) and a floor Y (whatever
 * solid is beneath). Each frame the simulation:
 *   1. Raycasts down to find floors
 *   2. Raycasts horizontally to detect walls between columns
 *   3. Equalizes water levels between connected neighbors
 *   4. Applies buoyancy to overlapping bodies
 *
 * Water has finite volume — what you draw is what exists.
 */

/** Resolution: world-units per column */
const COL_WIDTH = 0.2;
/** Minimum water depth before a column dries up */
const MIN_DEPTH = 0.02;
/** Flow rate: fraction of level difference equalized per step */
const FLOW_RATE = 0.25;
/** Number of flow iterations per tick (more = faster settling) */
const FLOW_ITERS = 3;
/** Buoyancy multiplier (water density × gravity scale) */
const BUOYANCY_SCALE = 2.5;
/** Stagger: only re-raycast a fraction of columns each frame */
const RAYCAST_STAGGER = 4;

interface Column {
  /** World X center of this column */
  x: number;
  /** Water surface Y (top of water) */
  level: number;
  /** Floor Y (top of solid beneath) — updated by raycast */
  floor: number;
  /** Volume of water in this column (area = volume / COL_WIDTH) */
  volume: number;
  /** Whether left neighbor is blocked by a wall */
  wallLeft: boolean;
  /** Whether right neighbor is blocked by a wall */
  wallRight: boolean;
}

/** Convert a world-X to the column index key */
function colIndex(wx: number): number {
  return Math.round(wx / COL_WIDTH);
}

export class WaterSystem {
  /** Sparse map of column index → Column */
  private columns = new Map<number, Column>();
  private frameCount = 0;

  /** Add water volume at a world position */
  addWater(wx: number, wy: number, amount: number) {
    const idx = colIndex(wx);
    let col = this.columns.get(idx);
    if (!col) {
      col = {
        x: idx * COL_WIDTH,
        level: wy,
        floor: wy, // approximate — first raycast will find actual ground
        volume: 0,
        wallLeft: false,
        wallRight: false,
      };
      this.columns.set(idx, col);
    }
    col.volume += amount;
    // Raise level to accommodate new volume
    col.level = Math.max(col.level, col.floor + col.volume / COL_WIDTH);
  }

  /** Remove water volume at a world position. Returns actual amount removed. */
  removeWater(wx: number, _wy: number, radius: number, amount: number): number {
    let removed = 0;
    const minIdx = colIndex(wx - radius);
    const maxIdx = colIndex(wx + radius);
    for (let i = minIdx; i <= maxIdx && removed < amount; i++) {
      const col = this.columns.get(i);
      if (!col || col.volume <= 0) continue;
      const take = Math.min(col.volume, (amount - removed) / (maxIdx - minIdx + 1));
      col.volume -= take;
      removed += take;
    }
    return removed;
  }

  /** Clear all water */
  clear() {
    this.columns.clear();
    this.frameCount = 0;
  }

  /** Number of active columns */
  get columnCount(): number {
    return this.columns.size;
  }

  /** Tick the simulation. Call once per physics step. */
  tick(pw: PhysWorld) {
    this.frameCount++;
    if (this.columns.size === 0) return;

    this.updateFloors(pw);
    this.updateWalls(pw);
    for (let i = 0; i < FLOW_ITERS; i++) {
      this.flow();
    }
    this.pruneEmpty();
  }

  /** Apply buoyancy forces to all dynamic bodies overlapping water */
  applyBuoyancy(pw: PhysWorld, gravity: number) {
    if (this.columns.size === 0) return;

    const B2 = b2();

    pw.forEachBody((body) => {
      if (!isDynamic(body)) return;

      const aabb = this.bodyAABB(body);
      if (!aabb) return;

      const minIdx = colIndex(aabb.lx);
      const maxIdx = colIndex(aabb.ux);

      let totalSubmergedArea = 0;

      for (let i = minIdx; i <= maxIdx; i++) {
        const col = this.columns.get(i);
        if (!col || col.volume <= MIN_DEPTH * COL_WIDTH) continue;

        const waterTop = col.level;
        const bodyBottom = aabb.ly;
        const bodyTop = aabb.uy;

        if (bodyBottom >= waterTop) continue; // above water

        const submergedTop = Math.min(waterTop, bodyTop);
        const submergedHeight = submergedTop - bodyBottom;
        if (submergedHeight <= 0) continue;

        totalSubmergedArea += submergedHeight * COL_WIDTH;
      }

      if (totalSubmergedArea > 0) {
        // Buoyancy = ρ_water × g × submerged_volume (2D: area)
        const force = totalSubmergedArea * Math.abs(gravity) * BUOYANCY_SCALE;
        body.ApplyForceToCenter(new B2.b2Vec2(0, force), true);

        // Water drag — dampen velocity proportional to submersion
        const vel = body.GetLinearVelocity();
        const dragFactor = 0.98;
        body.SetLinearVelocity(new B2.b2Vec2(vel.x * dragFactor, vel.y * dragFactor));
        body.SetAngularVelocity(body.GetAngularVelocity() * dragFactor);
      }
    });
  }

  /** Get water level at a world X, or null if no water there */
  getLevel(wx: number): number | null {
    const col = this.columns.get(colIndex(wx));
    if (!col || col.volume <= MIN_DEPTH * COL_WIDTH) return null;
    return col.level;
  }

  /** Iterate visible columns for rendering. Yields [x, level, floor] tuples. */
  *visibleColumns(minX: number, maxX: number): Generator<{ x: number; level: number; floor: number }> {
    const minIdx = colIndex(minX) - 1;
    const maxIdx = colIndex(maxX) + 1;
    for (let i = minIdx; i <= maxIdx; i++) {
      const col = this.columns.get(i);
      if (col && col.volume > MIN_DEPTH * COL_WIDTH) {
        yield { x: col.x, level: col.level, floor: col.floor };
      }
    }
  }

  // ── Internal ──

  private updateFloors(pw: PhysWorld) {
    const B2 = b2();
    for (const [idx, col] of this.columns) {
      // Stagger raycasts: only update a fraction each frame
      if ((idx + this.frameCount) % RAYCAST_STAGGER !== 0) continue;

      // Raycast downward from just above the current floor
      const origin = new B2.b2Vec2(col.x, col.floor + 0.05);
      const translation = new B2.b2Vec2(0, -200.05); // downward
      const result = pw.castRayClosest(origin, translation);

      let bestY = -1000;
      if (result.hit) {
        // Check if the hit shape is on a static body (skip sensors and dynamic bodies)
        const shapeId = result.shapeId;
        if (!B2.b2Shape_IsSensor(shapeId)) {
          const bodyId = B2.b2Shape_GetBody(shapeId);
          // biome-ignore lint/suspicious/noExplicitAny: bodyId is opaque ID, cast to Body for type check
          const hitBody = bodyId as any as Body;
          if (!isDynamic(hitBody)) {
            bestY = result.point.y;
          }
        }
      }

      col.floor = bestY;
      // Recompute level from volume + floor
      col.level = col.floor + col.volume / COL_WIDTH;
    }
  }

  private updateWalls(pw: PhysWorld) {
    for (const [idx, col] of this.columns) {
      // Stagger wall checks too
      if ((idx + this.frameCount + 2) % RAYCAST_STAGGER !== 0) continue;

      // Check for walls at mid-water height
      const midY = col.floor + (col.level - col.floor) * 0.5;
      const halfCol = COL_WIDTH * 0.5;

      // Check left wall
      col.wallLeft = this.hasWall(pw, col.x - halfCol, col.x - halfCol - COL_WIDTH, midY);
      // Check right wall
      col.wallRight = this.hasWall(pw, col.x + halfCol, col.x + halfCol + COL_WIDTH, midY);
    }
  }

  private hasWall(pw: PhysWorld, fromX: number, toX: number, y: number): boolean {
    const B2 = b2();
    const origin = new B2.b2Vec2(fromX, y);
    const translation = new B2.b2Vec2(toX - fromX, 0);
    const result = pw.castRayClosest(origin, translation);

    if (!result.hit) return false;
    const shapeId = result.shapeId;
    if (B2.b2Shape_IsSensor(shapeId)) return false;
    const bodyId = B2.b2Shape_GetBody(shapeId);
    // biome-ignore lint/suspicious/noExplicitAny: bodyId is opaque ID, cast to Body for type check
    const hitBody = bodyId as any as Body;
    return !isDynamic(hitBody);
  }

  private flow() {
    // Sort column indices for consistent left-to-right sweep
    const indices = Array.from(this.columns.keys()).sort((a, b) => a - b);

    for (let k = 0; k < indices.length - 1; k++) {
      const idxL = indices[k];
      const idxR = indices[k + 1];

      // Only flow between adjacent columns
      if (idxR - idxL !== 1) continue;

      const colL = this.columns.get(idxL)!;
      const colR = this.columns.get(idxR)!;

      // Check wall between them (explicit wall OR implicit wall from floor step)
      if (colL.wallRight || colR.wallLeft) continue;

      // Floor difference acts as an implicit wall: if neither water level
      // exceeds the higher floor, the step/slope blocks flow entirely.
      const wallHeight = Math.max(colL.floor, colR.floor);
      if (colL.level <= wallHeight + 0.01 && colR.level <= wallHeight + 0.01) continue;

      const diff = colL.level - colR.level;
      if (Math.abs(diff) < 0.001) continue;

      // Transfer volume from higher to lower
      const transfer = diff * COL_WIDTH * FLOW_RATE;
      colL.volume -= transfer;
      colR.volume += transfer;

      // Recompute levels
      colL.level = colL.floor + Math.max(0, colL.volume) / COL_WIDTH;
      colR.level = colR.floor + Math.max(0, colR.volume) / COL_WIDTH;
    }

    // Also try to spread to empty neighbor columns (water needs to expand)
    for (let k = 0; k < indices.length; k++) {
      const idx = indices[k];
      const col = this.columns.get(idx)!;
      if (col.volume <= MIN_DEPTH * COL_WIDTH) continue;

      // Try expand right
      if (!col.wallRight && !this.columns.has(idx + 1)) {
        // Only expand if there's enough volume and water is above the floor
        if (col.volume > MIN_DEPTH * COL_WIDTH * 3 && col.level > col.floor + 0.05) {
          const newCol: Column = {
            x: (idx + 1) * COL_WIDTH,
            level: col.level,
            floor: col.floor, // approximate until raycasted
            volume: 0,
            wallLeft: false,
            wallRight: false,
          };
          this.columns.set(idx + 1, newCol);
          // Transfer some volume
          const transfer = col.volume * FLOW_RATE * 0.5;
          col.volume -= transfer;
          newCol.volume = transfer;
          col.level = col.floor + col.volume / COL_WIDTH;
          newCol.level = newCol.floor + newCol.volume / COL_WIDTH;
        }
      }

      // Try expand left
      if (!col.wallLeft && !this.columns.has(idx - 1)) {
        if (col.volume > MIN_DEPTH * COL_WIDTH * 3 && col.level > col.floor + 0.05) {
          const newCol: Column = {
            x: (idx - 1) * COL_WIDTH,
            level: col.level,
            floor: col.floor,
            volume: 0,
            wallLeft: false,
            wallRight: false,
          };
          this.columns.set(idx - 1, newCol);
          const transfer = col.volume * FLOW_RATE * 0.5;
          col.volume -= transfer;
          newCol.volume = transfer;
          col.level = col.floor + col.volume / COL_WIDTH;
          newCol.level = newCol.floor + newCol.volume / COL_WIDTH;
        }
      }
    }
  }

  private pruneEmpty() {
    const minVol = MIN_DEPTH * COL_WIDTH;
    for (const [idx, col] of this.columns) {
      if (col.volume <= minVol) {
        // Redistribute tiny leftover to neighbors
        const left = this.columns.get(idx - 1);
        const right = this.columns.get(idx + 1);
        if (left && col.volume > 0) {
          left.volume += col.volume / 2;
          left.level = left.floor + left.volume / COL_WIDTH;
        }
        if (right && col.volume > 0) {
          right.volume += col.volume / 2;
          right.level = right.floor + right.volume / COL_WIDTH;
        }
        this.columns.delete(idx);
      }
    }
  }

  /** Compute a simple AABB for a body by unioning all shape AABBs via flat API. */
  private bodyAABB(body: Body): { lx: number; ly: number; ux: number; uy: number } | null {
    const B2 = b2();
    const shapeIds: b2ShapeId[] = body.GetShapes() ?? [];
    if (shapeIds.length === 0) return null;

    let lx = Infinity;
    let ly = Infinity;
    let ux = -Infinity;
    let uy = -Infinity;

    for (const shapeId of shapeIds) {
      const aabb = B2.b2Shape_GetAABB(shapeId);
      const lb = aabb.lowerBound;
      const ub = aabb.upperBound;
      if (lb.x < lx) lx = lb.x;
      if (lb.y < ly) ly = lb.y;
      if (ub.x > ux) ux = ub.x;
      if (ub.y > uy) uy = ub.y;
    }

    return { lx, ly, ux, uy };
  }
}
