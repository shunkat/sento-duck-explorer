// Discrete actions. Each function mutates a draft state (already cloned by tick)
// and appends events. Rejected actions leave the draft unchanged.
import type { Level } from "../level/layout";
import { CHARACTER_RADIUS } from "../level/layout";
import { resolveCircle } from "../sim/collision";
import { add, distance } from "../sim/geometry";
import { wallsFor } from "../sim/movement";
import { zoneAtOr } from "../sim/zones";
import { MSG } from "./text";
import { DROP_OFFSET, REACH } from "./tuning";
import type {
  CharacterId,
  GameEvent,
  GameState,
  HumanId,
  ItemId,
  TransferDialog,
  ViolationId,
} from "./types";

export const TRANSFER_ALLOWLIST: readonly TransferDialog[] = [
  { item: "coin", from: "duck", to: "adult" },
  { item: "key", from: "adult", to: "child" },
];

export const holds = (s: GameState, item: ItemId, who: CharacterId): boolean => {
  const o = s.items[item].owner;
  return o.kind === "character" && o.id === who;
};

const posOf = (s: GameState, id: CharacterId) => s[id].pos;
const near = (s: GameState, a: CharacterId, b: CharacterId, d: number) => distance(posOf(s, a), posOf(s, b)) <= d;

const doorCenter = (level: Level, id: string) => {
  const d = level.doors.find((x) => x.id === id)!;
  return { x: (d.box.minX + d.box.maxX) / 2, z: (d.box.minZ + d.box.maxZ) / 2 };
};
const SAUNA_DOOR_CENTER = (level: Level) => doorCenter(level, "bath_sauna");

/** Doors whose bath side is a drying spot (the exits that need a dry body: F2, F5). */
export const DRYING_DOORS = ["bath_changing", "bath_sauna"] as const;

const isHuman = (id: CharacterId): id is HumanId => id !== "duck";

/**
 * A wet human may dry itself here: on the bath floor (not in the tub, not
 * already through the door) within REACH.dryAtExit of a drying door.
 */
export function atDryingSpot(s: GameState, level: Level, id: HumanId): boolean {
  const h = s[id];
  if (h.zone !== "bath") return false;
  return DRYING_DOORS.some((d) => distance(h.pos, doorCenter(level, d)) <= REACH.dryAtExit);
}

type Ctx = { s: GameState; level: Level; events: GameEvent[]; pending: ViolationId[] };

/** One interactable action, chosen by priority (design: Actions table). */
interface Candidate {
  /** Short Japanese label for the HUD hint ("E: ..."). */
  label: (c: Ctx) => string;
  applies: (c: Ctx) => boolean;
  run: (c: Ctx) => void;
}

/**
 * The E action, in priority order. The HUD hint and the action both read this
 * one list, so the hint always names what E will do (prototype-core-gameplay
 * design: E priority table).
 */
const CANDIDATES: Candidate[] = [
  {
    // 1. Dry self at the bath-side exit (wet controlled human only). The towel ends on the head.
    label: () => "タオルで体を拭く",
    applies: ({ s, level }) => isHuman(s.active) && s[s.active].wet === "wet" && atDryingSpot(s, level, s.active),
    run: ({ s }) => {
      const h = s[s.active as HumanId];
      h.wet = "dry";
      h.towel = "head";
    },
  },
  {
    // 2. Dress / undress at the locker. Never touches WetState (Req 6.7, 6.8).
    label: ({ s }) => (s[s.active as HumanId].clothing === "clothed" ? "服を脱ぐ" : "服を着る"),
    applies: ({ s, level }) =>
      isHuman(s.active) && s[s.active].zone === "changing" && distance(s[s.active].pos, level.locker) <= REACH.locker,
    run: ({ s }) => {
      const h = s[s.active as HumanId];
      h.clothing = h.clothing === "clothed" ? "unclothed" : "clothed";
    },
  },
  {
    // Pick up Coin (Duck)
    label: () => "500円玉を拾う",
    applies: ({ s, level }) =>
      s.active === "duck" &&
      s.items.coin.owner.kind === "node" &&
      s.items.coin.owner.id === "narrow_hole_coin" &&
      distance(s.duck.pos, level.nodes.narrow_hole_coin) <= REACH.coin,
    run: ({ s, events }) => {
      s.items.coin.owner = { kind: "character", id: "duck" };
      events.push({ kind: "itemMoved", item: "coin", to: s.items.coin.owner });
    },
  },
  {
    // Equip Hat (Child → Duck). The only way the hat leaves Child.
    label: () => "アヒルにサウナハットを被せる",
    applies: ({ s }) =>
      s.active === "child" && holds(s, "hat", "child") && s.duck.carriedBy === null && near(s, "child", "duck", REACH.equip),
    run: ({ s, events }) => {
      s.items.hat = { owner: { kind: "character", id: "duck" }, status: "equipped" };
      events.push({ kind: "itemMoved", item: "hat", to: s.items.hat.owner });
    },
  },
  {
    // Give item: allowlisted transfers only; opens a confirmation dialog.
    label: ({ s }) => (findTransfer(s)?.item === "coin" ? "大人に500円玉を渡す" : "子どもに鍵を渡す"),
    applies: ({ s }) => findTransfer(s) !== null,
    run: ({ s }) => {
      s.dialog = findTransfer(s);
    },
  },
  {
    // Pay the sauna fee (Adult at the reception desk).
    label: ({ s }) => (holds(s, "coin", "adult") ? "サウナ代500円を払って鍵を受け取る" : "受付（500円玉が必要）"),
    applies: ({ s, level }) =>
      s.active === "adult" && s.adult.zone === "reception" && distance(s.adult.pos, level.nodes.reception_desk) <= REACH.desk,
    run: ({ s, events }) => {
      if (!holds(s, "coin", "adult") || s.items.key.owner.kind !== "node") {
        events.push({ kind: "rejected", reason: MSG.needCoin });
        return;
      }
      s.items.coin = { owner: { kind: "node", id: "reception_register" }, status: "paid" };
      s.items.key = { owner: { kind: "character", id: "adult" }, status: "available" };
      events.push({ kind: "itemMoved", item: "coin", to: s.items.coin.owner });
      events.push({ kind: "itemMoved", item: "key", to: s.items.key.owner });
    },
  },
  {
    // Unlock the sauna door (Child with the key).
    label: () => "サウナ室の扉を鍵で開ける",
    applies: ({ s, level }) =>
      s.active === "child" &&
      holds(s, "key", "child") &&
      s.saunaDoor === "locked" &&
      distance(s.child.pos, SAUNA_DOOR_CENTER(level)) <= REACH.saunaDoor,
    run: ({ s, events }) => {
      s.saunaDoor = "unlocked";
      events.push({ kind: "doorUnlocked" });
    },
  },
  {
    // Pick up the hat from the shelf (Child).
    label: () => "アヒル用サウナハットを借りる",
    applies: ({ s, level }) =>
      s.active === "child" &&
      s.items.hat.owner.kind === "node" &&
      distance(s.child.pos, level.nodes.sauna_hat_shelf) <= REACH.hat,
    run: ({ s, events }) => {
      s.items.hat = { owner: { kind: "character", id: "child" }, status: "available" };
      events.push({ kind: "itemMoved", item: "hat", to: s.items.hat.owner });
    },
  },
  {
    // Pick up Duck (Adult only; Duck must not already be carried).
    label: () => "アヒルを抱える",
    applies: ({ s }) =>
      s.active === "adult" &&
      s.duck.carriedBy === null &&
      !s.duck.inPond &&
      s.items.hat.status === "equipped" &&
      near(s, "adult", "duck", REACH.pickUpDuck),
    run: ({ s }) => {
      s.duck.carriedBy = "adult";
      s.duck.pos = { ...s.adult.pos };
      s.duck.vel = { x: 0, z: 0 };
      s.duck.zone = s.adult.zone;
    },
  },
  {
    // Place Duck in the pond, or put Duck down elsewhere (Adult carrying Duck).
    label: ({ s }) => (s.adult.zone === "pond_entrance" ? "アヒルを池に置く" : "アヒルを下ろす"),
    applies: ({ s }) => s.active === "adult" && s.duck.carriedBy === "adult",
    run: (c) => {
      const { s } = c;
      if (s.adult.zone === "pond_entrance") {
        if (s.child.zone !== "pond_entrance") {
          c.events.push({ kind: "rejected", reason: MSG.needBothAtShore });
          return;
        }
        placeDuckInPond(c);
      } else {
        putDuckDown(c);
      }
    },
  },
  {
    // 4. Dry a wet Duck nearby (a dry human out of the water). Duck needs no drying to progress.
    label: () => "アヒルを拭く",
    applies: ({ s }) =>
      isHuman(s.active) &&
      s[s.active].wet === "dry" &&
      s[s.active].zone !== "bathwater" &&
      s[s.active].zone !== "splash" &&
      s.duck.wet === "wet" &&
      !s.duck.inPond &&
      s.duck.carriedBy === null &&
      near(s, s.active, "duck", REACH.dryDuck),
    run: ({ s }) => {
      s.duck.wet = "dry";
    },
  },
  {
    // 5. Lowest: move the own towel between hand and head. Humans only; Duck has no towel.
    label: ({ s }) => (s[s.active as HumanId].towel === "head" ? "タオルを手に持つ" : "タオルを頭にのせる"),
    applies: ({ s }) => isHuman(s.active),
    run: ({ s }) => {
      const h = s[s.active as HumanId];
      h.towel = h.towel === "head" ? "held" : "head";
    },
  },
];

function findTransfer(s: GameState): TransferDialog | null {
  for (const t of TRANSFER_ALLOWLIST) {
    if (s.active === t.from && holds(s, t.item, t.from) && near(s, t.from, t.to, REACH.give)) return { ...t };
  }
  return null;
}

function placeDuckInPond({ s, level }: Ctx): void {
  // Automatic switch to Duck happens together with the placement (Req 1.9).
  s.duck.carriedBy = null;
  s.duck.inPond = true;
  s.duck.pos = { ...level.pondSpawn };
  s.duck.vel = { x: 0, z: 0 };
  s.duck.zone = zoneAtOr(level, s.duck.pos, "pond");
  s.duck.wet = "wet";
  s.active = "duck";
}

function putDuckDown({ s, level }: Ctx): void {
  const walls = wallsFor(level, s.saunaDoor);
  s.duck.carriedBy = null;
  s.duck.pos = resolveCircle(add(s.adult.pos, DROP_OFFSET), CHARACTER_RADIUS.duck, walls);
  s.duck.zone = zoneAtOr(level, s.duck.pos, s.duck.zone);
}

/** The `interact` input: run the first applicable candidate. */
export function interact(c: Ctx): void {
  const cand = CANDIDATES.find((x) => x.applies(c));
  if (cand) cand.run(c);
  else c.events.push({ kind: "rejected", reason: MSG.nothingHere });
}

/** Label of the action `interact` would run now, for the HUD (no side effects). */
export function interactHint(s: GameState, level: Level): string | null {
  const c: Ctx = { s, level, events: [], pending: [] };
  const cand = CANDIDATES.find((x) => x.applies(c));
  return cand ? cand.label(c) : null;
}

/** Confirm or cancel an open transfer dialog. */
export function resolveDialog(c: Ctx, confirm: boolean): void {
  const { s } = c;
  const d = s.dialog;
  if (!d) return;
  s.dialog = null;
  if (!confirm) return; // cancel: owners unchanged (Req 5.2)
  if (!holds(s, d.item, d.from)) return;
  s.items[d.item].owner = { kind: "character", id: d.to };
  c.events.push({ kind: "itemMoved", item: d.item, to: s.items[d.item].owner });
}

export type { Ctx };
