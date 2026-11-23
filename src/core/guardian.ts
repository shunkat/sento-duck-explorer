// The guardian walks a fixed, collision-checked dry-floor route. Asking the
// adult starts an escort; access to the sauna depends on their real position.
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { moveCircle } from "../sim/collision";
import { distance, scale, sub } from "../sim/geometry";
import { isSauna, zoneAt } from "../sim/zones";
import { DT, GUARDIAN_SPEED } from "./tuning";
import type { CoreState, GuardianState } from "./types";

export const GUARDIAN_GATE = 3;
export const GUARDIAN_SAUNA_DOOR = 6;
export const GUARDIAN_SAUNA_INSIDE = 8;

/** The adult comes to the gate, waits at the sauna door, then enters with Child. */
export function guardianTarget(s: Pick<CoreState, "player" | "guardian">, level: Level): number {
  if (s.player.stage === "duck") return 0;
  if (s.player.stage === "adult") return 2;
  if (!s.guardian.escortRequested) return GUARDIAN_GATE;
  const door = level.doors.find((d) => d.id === "bath_sauna")!.box;
  const center = { x: (door.minX + door.maxX) / 2, z: (door.minZ + door.maxZ) / 2 };
  // The adult walks through first as Child approaches, so running cannot
  // reach the milk and end the escort before the adult actually enters.
  return isSauna(s.player.zone) || distance(s.player.pos, center) <= 1.0
    ? GUARDIAN_SAUNA_INSIDE : GUARDIAN_SAUNA_DOOR;
}

/** Entry needs the requested adult physically beside the doorway, not a remote flag. */
export function guardianReadyForSauna(s: Pick<CoreState, "guardian">, level: Level): boolean {
  if (!s.guardian.escortRequested) return false;
  const door = level.doors.find((d) => d.id === "bath_sauna")!.box;
  const center = { x: (door.minX + door.maxX) / 2, z: (door.minZ + door.maxZ) / 2 };
  return s.guardian.pos.x >= door.maxX + CHARACTER_RADIUS.adult
    && isSauna(zoneAt(level, s.guardian.pos) ?? "bath")
    && distance(s.guardian.pos, center) <= 1.6;
}

/** One tick: advance through real waypoints, retaining direction at turns. */
export function stepGuardian(g: GuardianState, target: number, level: Level): GuardianState {
  const path = level.guardianPath;
  const here = path[g.at]!;
  let at = g.at;
  if (distance(g.pos, here) < 1e-6 && at !== target) at += Math.sign(target - at);
  const goal = path[at]!;
  const d = distance(g.pos, goal);
  if (d < 1e-6) return { ...g, at };
  const stepLen = Math.min(d, GUARDIAN_SPEED * DT);
  const next = moveCircle(g.pos, scale(sub(goal, g.pos), stepLen / d), CHARACTER_RADIUS.adult, [...level.walls, ...level.npcs]);
  return { ...g, pos: distance(next, goal) < 1e-4 ? { ...goal } : next, at };
}
