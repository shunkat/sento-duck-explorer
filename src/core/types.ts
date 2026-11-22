// Pure game-state types. No rendering or DOM dependencies.
// Growth and exit (2026-11-21): one player grows Duck → Child → Adult by
// drinking milk bottles, and clears by leaving the sento (prototype-core-gameplay
// Requirement 11, design "Growth and exit").

/** A point or vector on the XZ ground plane, in meters. */
export interface Vec2 {
  x: number;
  z: number;
}

/** The player's growth stage; also the id of the model and camera profile for that stage. */
export type CharacterId = "duck" | "child" | "adult";
export type Stage = CharacterId;
export type HumanId = "child" | "adult";

export type ZoneId =
  | "bath"
  | "bathwater"
  | "splash"
  | "narrow_hole"
  | "kids_pool"
  | "kids_passage"
  | "kids_room"
  | "changing"
  | "reception"
  | "common"
  | "genkan"
  | "street"
  | "sauna_entry"
  | "sauna_crowd"
  | "open_air"
  | "pond_entrance"
  | "pond";

/** The two unique milk bottles: milk1 grows Duck into Child, milk2 grows Child into Adult. */
export type MilkId = "milk1" | "milk2";
export type NodeId = MilkId;

/** Doors with a handle only the Adult can reach. */
export type HighDoorId = "kidsGate" | "frontExit";

export interface PlayerState {
  stage: Stage;
  pos: Vec2;
  vel: Vec2;
  /** Most specific zone containing `pos`. */
  zone: ZoneId;
  wet: "wet" | "dry";
  /** Duck is always "unclothed". */
  clothing: "clothed" | "unclothed";
  /** Duck has no towel ("none"); a human's towel is in the hand or on the head. */
  towel: "none" | "held" | "head";
}

/** Non-player adult who watches the Child (scripted; never blocks the player). */
export interface GuardianState {
  pos: Vec2;
  /** Index of the spot in `LEVEL.guardianPath` it stands at or walks toward next. */
  at: number;
}

export type ViolationId = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7" | "F8";

export type CheckpointId = "start" | "childGrown" | "adultGrown";

export type Outcome =
  | { kind: "playing" }
  | { kind: "gameOver"; reason: ViolationId }
  | { kind: "cleared" };

/** Game state without the stored checkpoint snapshots. */
export interface CoreState {
  player: PlayerState;
  milk: Record<MilkId, "available" | "collected">;
  doors: Record<HighDoorId, "closed" | "open">;
  guardian: GuardianState;
  outcome: Outcome;
  lastCheckpoint: CheckpointId;
  tickCount: number;
}

export interface GameState extends CoreState {
  /** Snapshots are stored without their own `checkpoints` field. */
  checkpoints: Partial<Record<CheckpointId, CoreState>>;
}

export interface InputFrame {
  /** Direction on the XZ plane; (0,0) when idle. Length ≤ 1. */
  move: Vec2;
  run: boolean;
  interact: boolean;
  dipTowel: boolean;
  shout: boolean;
  push: boolean;
  restart: boolean;
}

export type GameEvent =
  | { kind: "rejected"; reason: string }
  | { kind: "prompt"; text: string }
  | { kind: "grew"; milk: MilkId; from: Stage; to: Stage }
  | { kind: "doorOpened"; id: HighDoorId }
  | { kind: "checkpointSaved"; id: CheckpointId }
  | { kind: "restored"; id: CheckpointId }
  | { kind: "gameOver"; reason: ViolationId }
  | { kind: "cleared" };

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

export const EMPTY_INPUT: InputFrame = Object.freeze({
  move: Object.freeze({ x: 0, z: 0 }),
  run: false,
  interact: false,
  dipTowel: false,
  shout: false,
  push: false,
  restart: false,
}) as InputFrame;
