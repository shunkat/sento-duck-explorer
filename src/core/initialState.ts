import type { Level } from "../level/layout";
import { zoneAt } from "../sim/zones";
import type { CoreState, GameState, Vec2, ZoneId } from "./types";

export function zoneOf(level: Level, p: Vec2): ZoneId {
  const z = zoneAt(level, p);
  if (z === null) throw new Error(`Spawn point (${p.x}, ${p.z}) is outside every zone`);
  return z;
}

/** Strip stored snapshots so a snapshot never nests other snapshots. */
export function toCore(state: GameState | CoreState): CoreState {
  const { checkpoints: _ignored, ...core } = state as GameState;
  return structuredClone(core);
}

/** Start of the game: the player is Duck in the tub; all four bottles available, both high doors closed. */
export function createInitialState(level: Level): GameState {
  const core: CoreState = {
    player: {
      stage: "duck",
      pos: { ...level.start },
      vel: { x: 0, z: 0 },
      zone: zoneOf(level, level.start),
      wet: "wet",
      clothing: "unclothed",
      towel: "none",
    },
    milk: { milk1: "available", milk2: "available", milk3: "available", milk4: "available" },
    doors: { kidsGate: "closed", frontExit: "closed" },
    guardian: { pos: { ...level.guardianPath[0]! }, at: 0, escortRequested: false },
    outcome: { kind: "playing" },
    lastCheckpoint: "start",
    tickCount: 0,
  };
  return { ...core, checkpoints: { start: toCore(core) } };
}
