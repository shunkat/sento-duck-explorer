// Save each bottle and the escort request. Snapshots keep both progress and
// the guardian's actual position; restoring never teleports the adult ahead.
import type { Level } from "../level/layout";
import { toCore, zoneOf } from "./initialState";
import { MILK_IDS, type CheckpointId, type CoreState, type GameEvent, type GameState, type MilkId } from "./types";

export function reachedCheckpoint(s: GameState): CheckpointId | null {
  if (s.outcome.kind !== "playing") return null;
  if (s.player.stage === "adult") return s.checkpoints.adultGrown ? null : "adultGrown";
  if (s.player.stage === "child") {
    if (!s.checkpoints.childGrown) return "childGrown";
    if (!s.checkpoints.childMilkFound && (s.milk.milk3 === "collected" || s.milk.milk4 === "collected")) return "childMilkFound";
    if (!s.checkpoints.escortJoined && s.guardian.escortRequested) return "escortJoined";
    return null;
  }
  return !s.checkpoints.duckMilkFound && MILK_IDS.some((id) => s.milk[id] === "collected") ? "duckMilkFound" : null;
}

/** Bottle checkpoints use a checked nearby spot; the guardian stays where it was. */
export function takeSnapshot(s: GameState, id: CheckpointId, level: Level, milk?: MilkId): CoreState {
  const snap = toCore(s);
  snap.outcome = { kind: "playing" };
  snap.lastCheckpoint = id;
  if (milk) {
    const spot = level.growthSpots[milk];
    snap.player.pos = { ...spot };
    snap.player.zone = zoneOf(level, spot);
  }
  snap.player.vel = { x: 0, z: 0 };
  return snap;
}

export function saveCheckpointIfReached(s: GameState, level: Level, events: GameEvent[]): void {
  const id = reachedCheckpoint(s);
  if (!id) return;
  const milk = events.find((e) => e.kind === "milkCollected");
  s.checkpoints[id] = takeSnapshot(s, id, level, milk?.kind === "milkCollected" ? milk.milk : undefined);
  s.lastCheckpoint = id;
  events.push({ kind: "checkpointSaved", id });
}

/** Restore progress and escort state together, keeping stored snapshots. */
export function restoreLatest(s: GameState): GameState {
  const id = s.lastCheckpoint;
  const snap = s.checkpoints[id] ?? s.checkpoints.start!;
  const restored = structuredClone(snap);
  return { ...restored, tickCount: s.tickCount, checkpoints: structuredClone(s.checkpoints) };
}
