// Discrete E actions for the one player (growth and exit, 2026-11-21). Each
// function mutates a draft state (already cloned by tick) and appends events.
// Rejected actions leave the draft unchanged.
import type { Level } from "../level/layout";
import { CHARACTER_RADIUS } from "../level/layout";
import { circleOverlapsBox, distance, type AABB } from "../sim/geometry";
import { wallsFor } from "../sim/movement";
import { zoneAtOr } from "../sim/zones";
import { CHARACTER_NAME, MSG } from "./text";
import { REACH } from "./tuning";
import type { GameEvent, GameState, HighDoorId, MilkId, Stage, Vec2, ViolationId } from "./types";

const doorCenter = (level: Level, id: string) => {
  const d = level.doors.find((x) => x.id === id)!;
  return { x: (d.box.minX + d.box.maxX) / 2, z: (d.box.minZ + d.box.maxZ) / 2 };
};

/** Doors whose bath side is a drying spot (the exits that need a dry body: F2, F5). */
export const DRYING_DOORS = ["bath_changing", "bath_sauna"] as const;

/** Stage each bottle needs, and the stage it grows into. */
export const MILK_STAGE: Record<MilkId, { needs: Stage; grows: Stage }> = {
  milk1: { needs: "duck", grows: "child" },
  milk2: { needs: "child", grows: "adult" },
};

export const isHuman = (s: GameState): boolean => s.player.stage !== "duck";

/**
 * A wet human may dry itself here: on the bath floor (not in the tub, not
 * already through the door) within REACH.dryAtExit of a drying door.
 */
export function atDryingSpot(s: GameState, level: Level): boolean {
  const p = s.player;
  if (!isHuman(s) || p.zone !== "bath") return false;
  return DRYING_DOORS.some((d) => distance(p.pos, doorCenter(level, d)) <= REACH.dryAtExit);
}

/** True if the straight segment a→b passes through the inside of any box (walls, fixtures, closed doors). */
export function segmentBlocked(a: Vec2, b: Vec2, boxes: readonly AABB[]): boolean {
  const n = Math.max(1, Math.ceil(distance(a, b) / 0.02));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (boxes.some((w) => x > w.minX && x < w.maxX && z > w.minZ && z < w.maxZ)) return true;
  }
  return false;
}

/** The available bottle within reach with a clear line, if any (whatever the stage). */
export function milkInReach(s: GameState, level: Level): MilkId | null {
  const walls = wallsFor(level, s.doors);
  for (const id of ["milk1", "milk2"] as const) {
    if (s.milk[id] !== "available") continue;
    const at = level.nodes[id];
    if (distance(s.player.pos, at) > REACH.milk) continue;
    if (segmentBlocked(s.player.pos, at, walls)) continue;
    return id;
  }
  return null;
}

/** The closed high door whose handle is within reach, if any. */
export function highDoorInReach(s: GameState, level: Level): HighDoorId | null {
  for (const id of ["kidsGate", "frontExit"] as const) {
    if (s.doors[id] === "closed" && distance(s.player.pos, level.highDoors[id].handle) <= REACH.handle) return id;
  }
  return null;
}

type Ctx = { s: GameState; level: Level; events: GameEvent[]; pending: ViolationId[]; grew: boolean };

/**
 * Drink `milk` and grow (one atomic step): bottle collected, next stage,
 * position kept when the new collider fits (else the bottle's safe spot),
 * velocity reset, stage state rules applied.
 */
function grow(c: Ctx, milk: MilkId): void {
  const { s, level } = c;
  const p = s.player;
  const from = p.stage;
  const to = MILK_STAGE[milk].grows;
  s.milk[milk] = "collected";
  p.stage = to;
  const r = CHARACTER_RADIUS[to];
  const walls = wallsFor(level, s.doors);
  if (walls.some((w) => circleOverlapsBox(p.pos, r, w))) p.pos = { ...level.growthSpots[milk] };
  p.vel = { x: 0, z: 0 };
  p.zone = zoneAtOr(level, p.pos, p.zone);
  if (from === "duck") {
    // Duck → Child: the defined bathing state (provisional: towel on the head).
    p.wet = "wet";
    p.clothing = "unclothed";
    p.towel = "head";
  }
  c.grew = true;
  c.events.push({ kind: "grew", milk, from, to });
}

/** One interactable action, chosen by priority. */
interface Candidate {
  /** Short Japanese label for the HUD hint ("E: ..."). */
  label: (c: Ctx) => string;
  applies: (c: Ctx) => boolean;
  /** A rejected interaction is feedback, not an available control hint. */
  available?: (c: Ctx) => boolean;
  run: (c: Ctx) => void;
}

/**
 * The E action, in priority order. The HUD hint and the action both read this
 * one list, so the hint always names what E will do.
 */
const CANDIDATES: Candidate[] = [
  {
    // 1. Drink a milk bottle (right stage) or be told which stage it needs.
    label: ({ s, level }) => {
      const m = milkInReach(s, level)!;
      return MILK_STAGE[m].needs === s.player.stage
        ? `牛乳びんを飲む（${CHARACTER_NAME[MILK_STAGE[m].grows]}に育つ）`
        : `牛乳びん（${CHARACTER_NAME[MILK_STAGE[m].needs]}のときに飲める）`;
    },
    applies: ({ s, level }) => milkInReach(s, level) !== null,
    available: ({ s, level }) => MILK_STAGE[milkInReach(s, level)!].needs === s.player.stage,
    run: (c) => {
      const m = milkInReach(c.s, c.level)!;
      if (MILK_STAGE[m].needs !== c.s.player.stage) {
        c.events.push({ kind: "rejected", reason: MSG.milkWrongStage(MILK_STAGE[m].needs) });
        return;
      }
      grow(c, m);
    },
  },
  {
    // 2. Dry self at the bath-side exit (wet human only). The towel ends on the head.
    label: () => "タオルで体を拭く",
    applies: ({ s, level }) => s.player.wet === "wet" && atDryingSpot(s, level),
    run: ({ s }) => {
      s.player.wet = "dry";
      s.player.towel = "head";
    },
  },
  {
    // 3. Dress / undress at the locker. Never touches WetState.
    label: ({ s }) => (s.player.clothing === "clothed" ? "服を脱ぐ" : "服を着る"),
    applies: ({ s, level }) => isHuman(s) && s.player.zone === "changing" && distance(s.player.pos, level.locker) <= REACH.locker,
    run: ({ s }) => {
      s.player.clothing = s.player.clothing === "clothed" ? "unclothed" : "clothed";
    },
  },
  {
    // 4. Open a door with a high handle: Adult only; smaller stages get a hint.
    label: ({ s, level }) => {
      const d = highDoorInReach(s, level)!;
      if (s.player.stage !== "adult") return "取っ手が高くて届かない";
      return d === "frontExit" ? "玄関の戸を開ける" : "高い掛け金を外して戸を開ける";
    },
    applies: ({ s, level }) => highDoorInReach(s, level) !== null,
    available: ({ s }) => s.player.stage === "adult",
    run: ({ s, level, events }) => {
      const d = highDoorInReach(s, level)!;
      if (s.player.stage !== "adult") {
        events.push({ kind: "rejected", reason: MSG.handleTooHigh });
        return;
      }
      s.doors[d] = "open";
      events.push({ kind: "doorOpened", id: d });
    },
  },
  {
    // 5. Lowest: move the towel between hand and head. Humans only; Duck has no towel.
    label: ({ s }) => (s.player.towel === "head" ? "タオルを手に持つ" : "タオルを頭にのせる"),
    applies: ({ s }) => isHuman(s),
    run: ({ s }) => {
      s.player.towel = s.player.towel === "head" ? "held" : "head";
    },
  },
];

/** The `interact` input: run the first applicable candidate. */
export function interact(c: Ctx): void {
  const cand = CANDIDATES.find((x) => x.applies(c));
  if (cand) cand.run(c);
  else c.events.push({ kind: "rejected", reason: MSG.nothingHere });
}

/** Label of the action `interact` would run now, for the HUD (no side effects). */
export function interactHint(s: GameState, level: Level): string | null {
  if (s.outcome.kind !== "playing") return null;
  const c: Ctx = { s, level, events: [], pending: [], grew: false };
  const cand = CANDIDATES.find((x) => x.applies(c));
  return cand && (!cand.available || cand.available(c)) ? cand.label(c) : null;
}

export type { Ctx };
