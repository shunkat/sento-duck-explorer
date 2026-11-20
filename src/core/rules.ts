import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { circleOverlapsBox, distance } from "../sim/geometry";
import { type AreaId, isSauna } from "../sim/zones";
import { REACH } from "./tuning";
import type { CoreState, HumanId, HumanState, Outcome, Vec2, ViolationId, ZoneId } from "./types";

const OUTSIDE_CHANGING: ReadonlySet<AreaId> = new Set(["reception", "common", "exterior"]);
const SAUNA_AREAS: ReadonlySet<AreaId> = new Set(["sauna_entry", "sauna_crowd"]);

/**
 * Entry rule for a human moving from one area to another (F2, F4, F5).
 * Returns null when the move is allowed.
 */
export function entryViolation(h: Pick<HumanState, "wet" | "clothing">, from: AreaId, to: AreaId): ViolationId | null {
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

/** Clear requires the hat-wearing Duck itself inside the goal (Req 3.13–3.15). */
export function isCleared(s: CoreState): boolean {
  const hat = s.items.hat;
  return (
    s.duck.zone === "pond_goal" &&
    s.duck.inPond &&
    hat.owner.kind === "character" &&
    hat.owner.id === "duck" &&
    hat.status === "equipped"
  );
}

const ORDER: readonly ViolationId[] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"];

/** Game over wins over clear when both happen in the same tick (Req 7.9). */
export function decideOutcome(pending: readonly ViolationId[], cleared: boolean): Outcome {
  const first = ORDER.find((v) => pending.includes(v));
  if (first) return { kind: "gameOver", reason: first };
  if (cleared) return { kind: "cleared" };
  return { kind: "playing" };
}
