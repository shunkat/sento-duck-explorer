// Four provisional checkpoints. A snapshot is taken from the final state of a
// tick, normalized to safe spawn points, and restored as one consistent step.
import type { Level } from "../level/layout";
import { areaOf, zoneAtOr } from "../sim/zones";
import { toCore } from "./initialState";
import type { CheckpointId, CoreState, GameEvent, GameState, Vec2 } from "./types";

function place(level: Level, c: { pos: Vec2; vel: Vec2; zone: CoreState["duck"]["zone"] }, p: Vec2): void {
  c.pos = { ...p };
  c.vel = { x: 0, z: 0 };
  c.zone = zoneAtOr(level, c.pos, c.zone);
}

/** Which checkpoint (if any) the state has just reached. */
export function reachedCheckpoint(s: GameState): CheckpointId | null {
  if (s.outcome.kind !== "playing") return null;
  if (
    !s.checkpoints.duckInPond &&
    s.duck.inPond &&
    s.duck.carriedBy === null &&
    s.adult.zone === "pond_entrance" &&
    s.child.zone === "pond_entrance"
  ) {
    return "duckInPond";
  }
  if (!s.checkpoints.hatEquipped && s.items.hat.status === "equipped") return "hatEquipped";
  if (
    !s.checkpoints.paidReturned &&
    s.items.coin.status === "paid" &&
    areaOf(s.adult.zone) === "bath" &&
    areaOf(s.child.zone) === "bath"
  ) {
    return "paidReturned";
  }
  return null;
}

/** Snapshot with spawn normalization so restoring never repeats the same failure. */
export function takeSnapshot(s: GameState, id: CheckpointId, level: Level): CoreState {
  const snap = toCore(s);
  snap.outcome = { kind: "playing" };
  snap.dialog = null;
  snap.lastCheckpoint = id;
  const sp = level.checkpointSpawns;
  switch (id) {
    case "start":
      break;
    case "paidReturned":
      place(level, snap.adult, sp.paidReturned.adult);
      place(level, snap.child, sp.paidReturned.child);
      break; // a Duck held by Child follows the carrier below
    case "hatEquipped":
      place(level, snap.duck, sp.hatEquipped.duck);
      place(level, snap.child, sp.hatEquipped.child);
      place(level, snap.adult, sp.hatEquipped.adult);
      snap.duck.carriedBy = null;
      break;
    case "duckInPond":
      place(level, snap.duck, level.pondSpawn);
      place(level, snap.adult, sp.duckInPondShore.adult);
      place(level, snap.child, sp.duckInPondShore.child);
      snap.active = "duck";
      break;
  }
  // A carried Duck is stored exactly at its (possibly moved) carrier.
  const carrier = snap.duck.carriedBy;
  if (carrier) {
    snap.duck.pos = { ...snap[carrier].pos };
    snap.duck.zone = snap[carrier].zone;
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

/** Restore the most recent checkpoint, keeping the stored snapshots (Req 10.8). */
export function restoreLatest(s: GameState): GameState {
  const id = s.lastCheckpoint;
  const snap = s.checkpoints[id] ?? s.checkpoints.start!;
  const restored = structuredClone(snap);
  return { ...restored, tickCount: s.tickCount, checkpoints: structuredClone(s.checkpoints) };
}
