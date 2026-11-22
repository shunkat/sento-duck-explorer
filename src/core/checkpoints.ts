// Three provisional checkpoints (growth and exit, 2026-11-21): start, after
// Child growth, after Adult growth. A snapshot is taken from the final state
// of a tick, normalized to the bottle's safe growth spot, and restored as one
// consistent step. In-memory only: there is no persistent save to migrate.
import type { Level } from "../level/layout";
import { guardianTarget } from "./guardian";
import { toCore, zoneOf } from "./initialState";
import type { CheckpointId, CoreState, GameEvent, GameState } from "./types";

/** Which checkpoint (if any) the state has just reached. */
export function reachedCheckpoint(s: GameState): CheckpointId | null {
  if (s.outcome.kind !== "playing") return null;
  if (!s.checkpoints.adultGrown && s.milk.milk2 === "collected") return "adultGrown";
  if (!s.checkpoints.childGrown && s.milk.milk1 === "collected") return "childGrown";
  return null;
}

/** Snapshot with spawn normalization so restoring never repeats a failure or overlaps a wall. */
export function takeSnapshot(s: GameState, id: CheckpointId, level: Level): CoreState {
  const snap = toCore(s);
  snap.outcome = { kind: "playing" };
  snap.lastCheckpoint = id;
  if (id !== "start") {
    const spot = level.growthSpots[id === "childGrown" ? "milk1" : "milk2"];
    snap.player.pos = { ...spot };
    snap.player.vel = { x: 0, z: 0 };
    snap.player.zone = zoneOf(level, spot);
    const at = guardianTarget(snap);
    snap.guardian = { pos: { ...level.guardianPath[at]! }, at };
  }
  return snap;
}

/** Save a checkpoint if one was reached this tick. */
export function saveCheckpointIfReached(s: GameState, level: Level, events: GameEvent[]): void {
  const id = reachedCheckpoint(s);
  if (!id) return;
  s.checkpoints[id] = takeSnapshot(s, id, level);
  s.lastCheckpoint = id;
  events.push({ kind: "checkpointSaved", id });
}

/** Restore the most recent checkpoint, keeping the stored snapshots. */
export function restoreLatest(s: GameState): GameState {
  const id = s.lastCheckpoint;
  const snap = s.checkpoints[id] ?? s.checkpoints.start!;
  const restored = structuredClone(snap);
  return { ...restored, tickCount: s.tickCount, checkpoints: structuredClone(s.checkpoints) };
}
