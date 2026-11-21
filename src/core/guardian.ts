// The guardian: a scripted non-player adult who watches the Child (2026-11-21,
// provisional). It walks along `LEVEL.guardianPath`, a chain of checked
// dry-floor spots outside the kids' corner, one spot at a time. It never
// enters water, the kids' corner or the women's entrance, and never blocks
// the player (it is not in any collision list).
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { moveCircle } from "../sim/collision";
import { distance, scale, sub } from "../sim/geometry";
import { DT, GUARDIAN_SPEED } from "./tuning";
import type { CoreState, GuardianState } from "./types";

/** Chain index the guardian should stand at for this player state: pool, room or rest. */
export function guardianTarget(s: Pick<CoreState, "player">): number {
  const p = s.player;
  if (p.stage === "adult") return 2;
  if (p.stage === "child" && (p.zone === "kids_passage" || p.zone === "kids_room")) return 1;
  return 0;
}

/** One tick: walk toward the next chain spot on the way to the target. */
export function stepGuardian(g: GuardianState, target: number, level: Level): GuardianState {
  const path = level.guardianPath;
  const here = path[g.at]!;
  let at = g.at;
  if (distance(g.pos, here) < 1e-6 && at !== target) at += Math.sign(target - at);
  const goal = path[at]!;
  const d = distance(g.pos, goal);
  if (d < 1e-6) return { pos: g.pos, at };
  const stepLen = Math.min(d, GUARDIAN_SPEED * DT);
  const next = moveCircle(g.pos, scale(sub(goal, g.pos), stepLen / d), CHARACTER_RADIUS.adult, level.walls);
  // Snap the last sub-millimetre so the spot counts as reached.
  return { pos: distance(next, goal) < 1e-4 ? { ...goal } : next, at };
}
