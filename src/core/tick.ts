// The only way game state changes. Pure: never mutates its input state.
// One player (growth and exit, 2026-11-21).
import { CHARACTER_RADIUS, type Level } from "../level/layout";
import { stepDuckWater, stepWalk, wallsFor } from "../sim/movement";
import { areaOf, inBathWater, isSauna, isWetSource, zoneAtOr } from "../sim/zones";
import { type Ctx, interact } from "./actions";
import { restoreLatest, saveCheckpointIfReached } from "./checkpoints";
import { guardianTarget, stepGuardian } from "./guardian";
import { crossesFrontExit, decideOutcome, entryViolation, npcWithinPushReach, pushesIntoWomensEntrance, stepsOnSoap } from "./rules";
import { MSG } from "./text";
import type { GameEvent, GameState, HumanId, InputFrame, TickResult } from "./types";

export function tick(state: GameState, input: InputFrame, level: Level): TickResult {
  const events: GameEvent[] = [];

  // 1. Frozen check: game over waits for R; a cleared game ignores input (the view starts a new game).
  if (state.outcome.kind === "gameOver") {
    if (input.restart) {
      const restored = restoreLatest(state);
      restored.tickCount = state.tickCount + 1;
      events.push({ kind: "restored", id: restored.lastCheckpoint });
      return { state: restored, events };
    }
    return { state: { ...state, tickCount: state.tickCount + 1 }, events };
  }
  if (state.outcome.kind === "cleared") {
    return { state: { ...state, tickCount: state.tickCount + 1 }, events };
  }

  const s: GameState = structuredClone(state);
  s.tickCount += 1;
  const c: Ctx = { s, level, events, pending: [], grew: false };
  const p = s.player;
  const human: HumanId | null = p.stage === "duck" ? null : p.stage;

  // 2. Action stage: one discrete action per tick.
  if (input.interact) interact(c);
  else if (input.toggleTowel) {
    // Explicit towel move (T or the action menu). Duck has no towel.
    if (human) p.towel = p.towel === "head" ? "held" : "head";
  } else if (input.dipTowel) {
    // F1 only when the towel actually goes into the water: it must be in the hand.
    if (human && inBathWater(level, p.pos)) {
      if (p.towel === "held") c.pending.push("F1");
      else events.push({ kind: "prompt", text: MSG.towelOnHead });
    }
  } else if (input.shout) {
    if (human && isSauna(p.zone)) c.pending.push("F6");
    else if (human) events.push({ kind: "prompt", text: MSG.shoutOutsideSauna });
  } else if (input.push) {
    if (human && npcWithinPushReach(level, human, p.pos, p.zone)) c.pending.push("F7");
  }

  // 3. Movement stage. Skipped when the player grew this tick (no extra move)
  // or an action already ended the game.
  let cleared = false;
  if (!c.grew && c.pending.length === 0) {
    const walls = wallsFor(level, s.doors);
    if (!human) {
      // Duck only swims on water.
      p.pos = stepDuckWater(p.pos, input.move, walls, level.duckWater);
      p.zone = zoneAtOr(level, p.pos, p.zone);
      // The 女湯 step stops a Duck by collision; it only gets a hint, never F8.
      if (pushesIntoWomensEntrance(level, p.pos, CHARACTER_RADIUS.duck, input.move)) {
        events.push({ kind: "prompt", text: MSG.duckStepTooHigh });
      }
    } else {
      const before = p.pos;
      const next = stepWalk(human, before, input.move, input.run, walls);
      // F8: the player pushes into the 女湯 entrance. Checked before and after
      // the move, so the step collision stopping the body still counts.
      const r = CHARACTER_RADIUS[human];
      if (pushesIntoWomensEntrance(level, before, r, input.move) || pushesIntoWomensEntrance(level, next, r, input.move)) {
        c.pending.push("F8");
      }
      if (next.x !== before.x || next.z !== before.z) {
        const fromArea = areaOf(p.zone);
        const nextZone = zoneAtOr(level, next, p.zone);
        const toArea = areaOf(nextZone);
        const v = entryViolation(p, fromArea, toArea);
        if (v) c.pending.push(v);
        p.pos = next;
        p.zone = nextZone;
        // Leaving the sauna makes a human sweaty (wet) (provisional).
        if ((fromArea === "sauna_entry" || fromArea === "sauna_crowd") && !isSauna(nextZone)) p.wet = "wet";
        if (input.run && stepsOnSoap(level, human, p.pos)) c.pending.push("F3");
        cleared = crossesFrontExit(p.stage, fromArea, toArea);
      }
    }
  }

  // 4. Wetness from water zones.
  if (isWetSource(p.zone) || inBathWater(level, p.pos)) p.wet = "wet";

  // 5. The guardian keeps watch (scripted; never blocks).
  s.guardian = stepGuardian(s.guardian, guardianTarget(s), level);

  // 6. Outcome: game over wins over clear; then checkpoints.
  s.outcome = decideOutcome(c.pending, cleared);
  if (s.outcome.kind === "gameOver") events.push({ kind: "gameOver", reason: s.outcome.reason });
  else if (s.outcome.kind === "cleared") events.push({ kind: "cleared" });
  else saveCheckpointIfReached(s, level, events);

  return { state: s, events };
}
