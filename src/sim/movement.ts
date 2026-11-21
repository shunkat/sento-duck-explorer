import { DT, RUN_SPEED, WALK_SPEED } from "../core/tuning";
import type { CharacterId, CoreState, Vec2 } from "../core/types";
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { moveCircle } from "./collision";
import { type AABB, circleOverlapsBox, length, scale } from "./geometry";

/** Collidable boxes for the current door state: closed high doors block (the sauna is never locked). */
export function wallsFor(level: Level, doors: CoreState["doors"]): AABB[] {
  const walls = [...level.walls, ...level.npcs];
  for (const id of ["kidsGate", "frontExit"] as const) if (doors[id] === "closed") walls.push(level.highDoors[id].blocker);
  return walls;
}

/** Clamp a move input to length ≤ 1. */
export function clampInput(move: Vec2): Vec2 {
  const len = length(move);
  if (!Number.isFinite(len) || len === 0) return { x: 0, z: 0 };
  return len > 1 ? scale(move, 1 / len) : move;
}

const inAny = (boxes: readonly AABB[], p: Vec2) =>
  boxes.some((b) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ);

/**
 * Land around the union of the water rects, as blocking boxes: the bounding
 * region (water grown by 1 m) is cut into a grid along every rect edge, and
 * each cell whose center is not on water becomes a box. Only the union's outer
 * boundary blocks, so the joints between overlapping rects stay open, and
 * concave corners (channel → tub) are solid land.
 */
export function shoreBoxes(water: readonly AABB[]): AABB[] {
  if (water.length === 0) return [];
  const m = 1;
  const xs = new Set<number>();
  const zs = new Set<number>();
  for (const w of water) {
    xs.add(w.minX).add(w.maxX);
    zs.add(w.minZ).add(w.maxZ);
  }
  const minX = Math.min(...xs) - m;
  const maxX = Math.max(...xs) + m;
  const minZ = Math.min(...zs) - m;
  const maxZ = Math.max(...zs) + m;
  xs.add(minX).add(maxX);
  zs.add(minZ).add(maxZ);
  const X = [...xs].sort((a, b) => a - b);
  const Z = [...zs].sort((a, b) => a - b);
  const out: AABB[] = [];
  for (let i = 0; i + 1 < X.length; i++) {
    for (let j = 0; j + 1 < Z.length; j++) {
      const c = { x: (X[i]! + X[i + 1]!) / 2, z: (Z[j]! + Z[j + 1]!) / 2 };
      if (!inAny(water, c)) out.push({ minX: X[i]!, maxX: X[i + 1]!, minZ: Z[j]!, maxZ: Z[j + 1]! });
    }
  }
  return out;
}

const SHORE = new WeakMap<readonly AABB[], AABB[]>();
const shoreOf = (water: readonly AABB[]) => {
  let b = SHORE.get(water);
  if (!b) SHORE.set(water, (b = shoreBoxes(water)));
  return b;
};

/**
 * One tick of Duck swimming outside the pond. The union's shore blocks Duck's
 * whole body (radius) like a wall, with the usual radius / sub-step circle
 * collision, so Duck glides along edges and corners and does not cross the
 * shore (the discrete collision can leave sub-millimetre contact at concave
 * corners). A start point that is not on water with clearance does not move
 * (no push-out jump from the floor), and a result off the water is discarded.
 */
export function stepDuckWater(pos: Vec2, move: Vec2, walls: readonly AABB[], water: readonly AABB[]): Vec2 {
  const dir = clampInput(move);
  if (dir.x === 0 && dir.z === 0) return pos;
  const r = CHARACTER_RADIUS.duck;
  const shore = shoreOf(water);
  if (!inAny(water, pos) || shore.some((b) => circleOverlapsBox(pos, r - DUCK_CLEARANCE_SLACK, b))) return pos;
  const q = moveCircle(pos, scale(dir, WALK_SPEED.duck * DT), r, [...walls, ...shore]);
  return inAny(water, q) ? q : pos;
}

/** Contact slack for the start-point check (collision leaves sub-mm overlaps at corners). */
const DUCK_CLEARANCE_SLACK = 1e-3;

/** One tick of walking or running on land. Duck cannot run. */
export function stepWalk(
  id: CharacterId,
  pos: Vec2,
  move: Vec2,
  run: boolean,
  walls: readonly AABB[],
): Vec2 {
  const dir = clampInput(move);
  if (dir.x === 0 && dir.z === 0) return pos;
  const speed = id !== "duck" && run ? RUN_SPEED : WALK_SPEED[id];
  return moveCircle(pos, scale(dir, speed * DT), CHARACTER_RADIUS[id], walls);
}
