import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { circleOverlapsBox, distance } from "../sim/geometry";
import { type AreaId, isSauna } from "../sim/zones";
import { REACH } from "./tuning";
import type { HumanId, Outcome, PlayerState, Vec2, ViolationId, ZoneId } from "./types";

const OUTSIDE_CHANGING: ReadonlySet<AreaId> = new Set(["reception", "common", "genkan", "street"]);
const SAUNA_AREAS: ReadonlySet<AreaId> = new Set(["sauna_entry", "sauna_crowd"]);

/**
 * Entry rule for a human moving from one area to another (F2, F4, F5).
 * Returns null when the move is allowed.
 */
export function entryViolation(h: Pick<PlayerState, "wet" | "clothing">, from: AreaId, to: AreaId): ViolationId | null {
  if (from === to) return null;
  if (to === "changing" && h.wet === "wet") return "F2";
  if (from === "changing" && OUTSIDE_CHANGING.has(to) && h.clothing === "unclothed") return "F4";
  if (SAUNA_AREAS.has(to) && !SAUNA_AREAS.has(from) && h.wet === "wet") return "F5";
  return null;
}

/** F3: a running human whose body overlaps a soap bar. */
export function stepsOnSoap(level: Level, id: HumanId, pos: Vec2): boolean {
  const r = CHARACTER_RADIUS[id];
  return level.soaps.some((s) => distance(s.pos, pos) < r + s.radius);
}

/** F7 applies only with an NPC body within reach of the pusher. */
export function npcWithinPushReach(level: Level, id: HumanId, pos: Vec2, zone: ZoneId): boolean {
  if (!isSauna(zone)) return false;
  return level.npcs.some((n) => circleOverlapsBox(pos, REACH.push + CHARACTER_RADIUS[id], n));
}

/**
 * Clear (2026-11-21; boundary moved 2026-11-22): the Adult player crosses from
 * the genkan through the street door to the street in this tick (review R-1). Nowhere else clears.
 */
export function crossesFrontExit(stage: PlayerState["stage"], from: AreaId, to: AreaId): boolean {
  return stage === "adult" && from === "genkan" && to === "street";
}

const ORDER: readonly ViolationId[] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8"];

/** Footprint margin (m) in front of the 女湯 step within which a push toward it counts. */
export const WOMENS_ENTRY_MARGIN = 0.15;
/** Minimum cosine between the move input and the inward direction (60°: straight and diagonal approaches). */
const WOMENS_ENTRY_MIN_DOT = 0.5;

/**
 * F8 / free-Duck hint: a body of radius `r` at `pos` pushes its move input into
 * the 女湯 entrance. The centre must be inside the doorway span (not the wall
 * beside it), the front edge within the margin of the step face, and the input
 * must point inward. Works whether or not the step collision stopped the body.
 */
export function pushesIntoWomensEntrance(level: Level, pos: Vec2, r: number, move: Vec2): boolean {
  const { doorway, step, inward } = level.womensEntrance;
  const len = Math.hypot(move.x, move.z);
  if (!(len > 0)) return false;
  if ((move.x * inward.x + move.z * inward.z) / len < WOMENS_ENTRY_MIN_DOT) return false;
  // shortcut: the entrance faces −x or +x (vertical wall); extend for a z-facing doorway if one is added.
  const lateralOk = pos.z >= doorway.minZ && pos.z <= doorway.maxZ;
  const face = inward.x < 0 ? step.maxX : step.minX;
  const gap = inward.x < 0 ? pos.x - r - face : face - (pos.x + r);
  return lateralOk && gap >= -r && gap <= WOMENS_ENTRY_MARGIN;
}

/** Game over wins over clear when both happen in the same tick (Req 7.9). */
export function decideOutcome(pending: readonly ViolationId[], cleared: boolean): Outcome {
  const first = ORDER.find((v) => pending.includes(v));
  if (first) return { kind: "gameOver", reason: first };
  if (cleared) return { kind: "cleared" };
  return { kind: "playing" };
}
