// Pure state → view model. The renderer only applies this, so what is drawn
// (one body for the current stage, the bottles, doors, the guardian) is
// testable without WebGL. Growth and exit (2026-11-21).
import { CHARACTER_NAME } from "../core/text";
import { MILK_IDS, type CharacterId, type GameState, type HighDoorId, type MilkId } from "../core/types";
import { CHARACTER_RADIUS, type Level } from "../level/layout";

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CharacterView {
  id: CharacterId;
  /** Center of the mesh. Every stage body sits at the player, so a growth never jumps to a stale place. */
  pos: Vec3;
  radius: number;
  height: number;
  /** Only the current stage's body is drawn. */
  visible: boolean;
  active: boolean;
  /** Picks the outfit variant of a human model. Duck is always "unclothed". */
  clothing: "clothed" | "unclothed";
  /** Humans only: where the towel is. Duck never has one. */
  towel?: "held" | "head";
}

export interface View {
  characters: Record<CharacterId, CharacterView>;
  /** Bottles stand on the floor at their node; `pos.y` is the bottom. Hidden once collected. */
  milk: Record<MilkId, { pos: Vec3; visible: boolean }>;
  doorsOpen: Record<HighDoorId, boolean>;
  guardian: Vec3;
  active: CharacterId;
  /** Point the camera looks at. */
  focus: Vec3;
}

export const BODY_HEIGHT: Record<CharacterId, number> = { duck: 0.3, child: 1.2, adult: 1.7 };

function characterView(s: GameState, id: CharacterId): CharacterView {
  const p = s.player;
  const r = CHARACTER_RADIUS[id];
  const h = BODY_HEIGHT[id];
  const y = id === "duck" ? r : h / 2;
  const current = p.stage === id;
  // Hidden human bodies still need a towel pose; they show the player's towel once grown.
  const towel = id === "duck" ? undefined : p.towel === "none" ? "head" : p.towel;
  return {
    id,
    pos: { x: p.pos.x, y, z: p.pos.z },
    radius: r,
    height: h,
    visible: current,
    active: current,
    clothing: id === "duck" ? "unclothed" : p.clothing,
    towel,
  };
}

export function deriveView(s: GameState, level: Level): View {
  const characters = {
    duck: characterView(s, "duck"),
    child: characterView(s, "child"),
    adult: characterView(s, "adult"),
  };
  const milk = {} as View["milk"];
  for (const id of MILK_IDS) {
    const n = level.nodes[id];
    milk[id] = { pos: { x: n.x, y: 0, z: n.z }, visible: s.milk[id] === "available" };
  }
  const a = characters[s.player.stage];
  return {
    characters,
    milk,
    doorsOpen: { kidsGate: s.doors.kidsGate === "open", frontExit: s.doors.frontExit === "open" },
    guardian: { x: s.guardian.pos.x, y: BODY_HEIGHT.adult / 2, z: s.guardian.pos.z },
    active: s.player.stage,
    focus: { x: a.pos.x, y: a.pos.y, z: a.pos.z },
  };
}

/** Compact progress badge; location and route descriptions stay out of the HUD. */
export function statusLines(s: GameState): string[] {
  const p = s.player;
  const n = (MILK_IDS).filter((m) => s.milk[m] === "collected").length;
  const progress = p.stage === "adult" ? "" : ` · 成長 ${n % 2}/2`;
  return [`${CHARACTER_NAME[p.stage]}${progress} · 牛乳 ${n}/4`];
}
