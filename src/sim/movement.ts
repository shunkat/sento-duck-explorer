import { DT, RUN_SPEED, WALK_SPEED } from "../core/tuning";
import type { CharacterId, Vec2 } from "../core/types";
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { moveCircle } from "./collision";
import { type AABB, length, scale } from "./geometry";

/** Collidable boxes for the current door state. */
export function wallsFor(level: Level, saunaDoor: "locked" | "unlocked"): AABB[] {
  const walls = [...level.walls, ...level.npcs];
  if (saunaDoor === "locked") walls.push(level.saunaDoorBlocker);
  return walls;
}

/** Clamp a move input to length ≤ 1. */
export function clampInput(move: Vec2): Vec2 {
  const len = length(move);
  if (!Number.isFinite(len) || len === 0) return { x: 0, z: 0 };
  return len > 1 ? scale(move, 1 / len) : move;
}

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
