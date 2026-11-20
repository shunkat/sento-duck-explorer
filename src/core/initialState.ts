import type { Level } from "../level/layout";
import { zoneAt } from "../sim/zones";
import type { CoreState, GameState, HumanState, Vec2, ZoneId } from "./types";

function zoneOf(level: Level, p: Vec2): ZoneId {
  const z = zoneAt(level, p);
  if (z === null) throw new Error(`Spawn point (${p.x}, ${p.z}) is outside every zone`);
  return z;
}

function human(level: Level, pos: Vec2): HumanState {
  return {
    pos: { ...pos },
    vel: { x: 0, z: 0 },
    zone: zoneOf(level, pos),
    wet: "wet",
    clothing: "unclothed",
    towel: "held",
  };
}

/** Strip stored snapshots so a snapshot never nests other snapshots. */
export function toCore(state: GameState | CoreState): CoreState {
  const { checkpoints: _ignored, ...core } = state as GameState;
  return structuredClone(core);
}

/** Start of the game: everyone in the bathwater, Duck active (Req 3.1). */
export function createInitialState(level: Level): GameState {
  const p = level.initialPositions;
  const core: CoreState = {
    active: "duck",
    duck: {
      pos: { ...p.duck },
      vel: { x: 0, z: 0 },
      zone: zoneOf(level, p.duck),
      wet: "wet",
      carriedBy: null,
      inPond: false,
    },
    child: human(level, p.child),
    adult: human(level, p.adult),
    items: {
      coin: { owner: { kind: "node", id: "narrow_hole_coin" }, status: "available" },
      key: { owner: { kind: "node", id: "reception_desk" }, status: "available" },
      hat: { owner: { kind: "node", id: "sauna_hat_shelf" }, status: "available" },
    },
    saunaDoor: "locked",
    dialog: null,
    outcome: { kind: "playing" },
    lastCheckpoint: "start",
    tickCount: 0,
  };
  return { ...core, checkpoints: { start: toCore(core) } };
}
