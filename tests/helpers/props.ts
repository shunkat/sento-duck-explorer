// Support for the property tests (Spec task 7.1): reachable stages built from
// the scripted route, and random input generators biased toward long held
// directions and interaction keys.
import fc from "fast-check";
import { tick } from "../../src/core/tick";
import { EMPTY_INPUT, type GameState, type InputFrame, type Vec2 } from "../../src/core/types";
import { REACH } from "../../src/core/tuning";
import { LEVEL } from "../../src/level/layout";
import * as R from "./route";
import { Sim } from "./sim";

export type StageName =
  | "start"
  | "coinInHand"
  | "coinDialog"
  | "coinGiven"
  | "changing"
  | "paid"
  | "keyDialog"
  | "keyGiven"
  | "unlocked"
  | "inSauna"
  | "hatTaken"
  | "hatEquipped"
  | "carriedAtShore"
  | "inPond"
  | "nearGoal"
  | "gameOver";

function fork(state: GameState): Sim {
  const sim = new Sim();
  sim.state = state;
  return sim;
}

function build(): Record<StageName, GameState> {
  const out = {} as Record<StageName, GameState>;
  const main = new Sim();
  out.start = main.state;

  R.duckGetsCoin(main);
  out.coinInHand = main.state;

  const d = fork(main.state);
  d.walk([{ x: 1, z: 5.5 }]);
  d.approach(d.pos("adult"), REACH.give);
  d.press("interact");
  out.coinDialog = d.state;

  R.duckGivesCoin(main);
  out.coinGiven = main.state;

  const ch = fork(main.state);
  R.pairToChanging(ch);
  out.changing = ch.state;

  R.adultPaysWithChild(main);
  out.paid = main.state;

  const k = fork(main.state);
  k.switchTo("adult");
  k.approach(k.pos("child"), REACH.give);
  k.press("interact");
  out.keyDialog = k.state;

  R.adultGivesKey(main);
  out.keyGiven = main.state;
  R.childUnlocksSauna(main);
  out.unlocked = main.state;
  R.childEntersSauna(main);
  out.inSauna = main.state;
  R.childGetsHat(main);
  out.hatTaken = main.state;
  R.childLeavesSauna(main);
  R.childEquipsHat(main);
  out.hatEquipped = main.state;

  R.adultCarriesDuckToShore(main);
  out.carriedAtShore = main.state;
  main.press("interact");
  out.inPond = main.state;
  main.walk(R.POND_PATH.slice(0, 4), { tol: 0.35, maxTicks: 3000 });
  out.nearGoal = main.state;

  const over = new Sim();
  over.switchTo("child");
  over.press("dipTowel");
  out.gameOver = over.state;
  return out;
}

let cache: Record<StageName, GameState> | null = null;
export function stages(): Record<StageName, GameState> {
  return (cache ??= build());
}
export const STAGE_NAMES: StageName[] = [
  "start", "coinInHand", "coinDialog", "coinGiven", "changing", "paid", "keyDialog", "keyGiven",
  "unlocked", "inSauna", "hatTaken", "hatEquipped", "carriedAtShore", "inPond", "nearGoal", "gameOver",
];
export const stageArb = fc.constantFrom(...STAGE_NAMES);

/** Stages where the game is still being played (no dialog, no game over). */
export const PLAYING_STAGES = STAGE_NAMES.filter((n) => n !== "gameOver" && n !== "coinDialog" && n !== "keyDialog");

// ---- input generators ----------------------------------------------------

const DIRS: Vec2[] = [
  { x: 0, z: 0 },
  { x: 1, z: 0 },
  { x: -1, z: 0 },
  { x: 0, z: 1 },
  { x: 0, z: -1 },
  { x: 0.7071, z: 0.7071 },
  { x: -0.7071, z: 0.7071 },
  { x: 0.7071, z: -0.7071 },
  { x: -0.7071, z: -0.7071 },
];

const moveArb: fc.Arbitrary<Vec2> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...DIRS) },
  { weight: 1, arbitrary: fc.record({ x: fc.double({ min: -1, max: 1, noNaN: true }), z: fc.double({ min: -1, max: 1, noNaN: true }) }) },
);

type KeyName = keyof Omit<InputFrame, "move" | "run">;
const ALL_KEYS: KeyName[] = ["switchCharacter", "interact", "confirm", "cancel", "dry", "dipTowel", "toggleClothes", "shout", "push", "restart"];

/** One input frame. Interaction keys are weighted toward the useful ones. */
export function frameArb(opts: { allow?: readonly KeyName[] } = {}): fc.Arbitrary<InputFrame> {
  const allow = opts.allow ?? ALL_KEYS.filter((k) => k !== "restart");
  const keyArb = fc.oneof(
    { weight: 10, arbitrary: fc.constant<KeyName | null>(null) },
    ...allow.map((k) => ({ weight: k === "interact" ? 4 : k === "switchCharacter" ? 3 : 1, arbitrary: fc.constant<KeyName | null>(k) })),
  );
  return fc
    .tuple(moveArb, fc.boolean(), keyArb)
    .map(([move, run, key]) => ({ ...EMPTY_INPUT, move, run, ...(key ? { [key]: true } : {}) }) as InputFrame);
}

/** A run of frames: each random frame is held for a few ticks (keys fire once). */
export function seqArb(opts: { allow?: readonly KeyName[]; maxSegments?: number; maxHold?: number } = {}): fc.Arbitrary<InputFrame[]> {
  return fc
    .array(fc.tuple(frameArb(opts), fc.integer({ min: 1, max: opts.maxHold ?? 30 })), { maxLength: opts.maxSegments ?? 12 })
    .map((segs) =>
      segs.flatMap(([f, n]) => [f, ...Array.from({ length: n - 1 }, () => ({ ...f, switchCharacter: false, interact: false, confirm: false, cancel: false, dry: false, dipTowel: false, toggleClothes: false, shout: false, push: false, restart: false }))]),
    );
}

export const withKey = (f: InputFrame, k: KeyName): InputFrame => ({ ...f, [k]: true });
export const idle = (): InputFrame => ({ ...EMPTY_INPUT });

/** Apply frames, calling `each` with the state before and after every tick. */
export function run(
  state: GameState,
  frames: readonly InputFrame[],
  each?: (before: GameState, input: InputFrame, after: GameState) => void,
): GameState {
  let s = state;
  for (const f of frames) {
    const r = tick(s, f, LEVEL);
    each?.(s, f, r.state);
    s = r.state;
  }
  return s;
}
