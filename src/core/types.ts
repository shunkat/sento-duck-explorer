// Pure game-state types. No rendering or DOM dependencies.

/** A point or vector on the XZ ground plane, in meters. */
export interface Vec2 {
  x: number;
  z: number;
}

export type CharacterId = "duck" | "child" | "adult";
export type HumanId = "child" | "adult";

export type ZoneId =
  | "bath"
  | "bathwater"
  | "splash"
  | "narrow_hole"
  | "changing"
  | "reception"
  | "common"
  | "exterior"
  | "sauna_entry"
  | "sauna_crowd"
  | "open_air"
  | "pond_entrance"
  | "pond"
  | "pond_goal";

export type NodeId =
  | "narrow_hole_coin"
  | "reception_desk"
  | "reception_register"
  | "sauna_hat_shelf";

export type Owner =
  | { kind: "character"; id: CharacterId }
  | { kind: "node"; id: NodeId };

export type ItemId = "coin" | "key" | "hat";

export interface ItemState {
  owner: Owner;
  /** `paid` is valid only for the Coin, `equipped` only for the Hat. */
  status: "available" | "paid" | "equipped";
}

export interface CharacterState {
  pos: Vec2;
  /** Velocity; used for Duck in the pond. */
  vel: Vec2;
  /** Most specific zone containing `pos`. */
  zone: ZoneId;
  wet: "wet" | "dry";
}

export interface HumanState extends CharacterState {
  clothing: "clothed" | "unclothed";
  /**
   * Each human has one towel from the start: in the hand or on the head.
   * Duck never has a towel. Separate from the Duck's sauna hat.
   */
  towel: "held" | "head";
}

export interface DuckState extends CharacterState {
  /**
   * Who holds Duck: Child before the hat is equipped (to bring it to the coin
   * channel), Adult from the hat to the pond. Duck never carries itself.
   */
  carriedBy: HumanId | null;
  inPond: boolean;
}

/** Allowlisted character-to-character transfers. The hat is excluded by type. */
export type TransferDialog =
  | { item: "coin"; from: "duck"; to: "adult" }
  | { item: "key"; from: "adult"; to: "child" };

export type ViolationId = "F1" | "F2" | "F3" | "F4" | "F5" | "F6" | "F7";

export type CheckpointId = "start" | "paidReturned" | "hatEquipped" | "duckInPond";

export type Outcome =
  | { kind: "playing" }
  | { kind: "gameOver"; reason: ViolationId }
  | { kind: "cleared" };

/** Game state without the stored checkpoint snapshots. */
export interface CoreState {
  active: CharacterId;
  duck: DuckState;
  child: HumanState;
  adult: HumanState;
  items: { coin: ItemState; key: ItemState; hat: ItemState };
  saunaDoor: "locked" | "unlocked";
  dialog: TransferDialog | null;
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
  /** Manual character switch (edge-triggered). */
  switchCharacter: boolean;
  interact: boolean;
  confirm: boolean;
  cancel: boolean;
  dipTowel: boolean;
  shout: boolean;
  push: boolean;
  restart: boolean;
}

export type GameEvent =
  | { kind: "switched"; to: CharacterId }
  | { kind: "rejected"; reason: string }
  | { kind: "prompt"; text: string }
  | { kind: "itemMoved"; item: ItemId; to: Owner }
  | { kind: "doorUnlocked" }
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
  switchCharacter: false,
  interact: false,
  confirm: false,
  cancel: false,
  dipTowel: false,
  shout: false,
  push: false,
  restart: false,
}) as InputFrame;
