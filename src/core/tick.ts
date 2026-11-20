// The only way game state changes. Pure: never mutates its input state.
import type { Level } from "../level/layout";
import { stepDuckWater, stepWalk, wallsFor } from "../sim/movement";
import { stepPond } from "../sim/pond";
import { inBathWater, isSauna, isWetSource, zoneAtOr } from "../sim/zones";
import { type Ctx, interact, resolveDialog } from "./actions";
import { restoreLatest, saveCheckpointIfReached } from "./checkpoints";
import { applyHumanMove } from "./pair";
import { decideOutcome, isCleared, npcWithinPushReach, stepsOnSoap } from "./rules";
import { MSG } from "./text";
import type { CharacterId, GameEvent, GameState, InputFrame, TickResult } from "./types";

const NEXT: Record<CharacterId, CharacterId> = { duck: "child", child: "adult", adult: "duck" };

export function tick(state: GameState, input: InputFrame, level: Level): TickResult {
  const events: GameEvent[] = [];

  // 1. Frozen check (Req 10.2).
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
  const c: Ctx = { s, level, events, pending: [] };

  // 2. Dialog stage: only confirm / cancel (Req 1.5, 5.2).
  if (s.dialog) {
    if (input.confirm) resolveDialog(c, true);
    else if (input.cancel) resolveDialog(c, false);
    return { state: s, events };
  }

  // 3. Manual switch: changes only `active` in this tick (Req 1.2, 1.7).
  if (input.switchCharacter) {
    s.active = NEXT[s.active];
    events.push({ kind: "switched", to: s.active });
    return { state: s, events };
  }

  // 4. Action stage: one discrete action per tick.
  const activeBefore = s.active;
  const human = s.active === "duck" ? null : s.active;
  if (input.interact) interact(c);
  else if (input.dipTowel) {
    // F1 only when the towel actually goes into the water: it must be in the hand.
    if (human && inBathWater(level, s[human].pos)) {
      if (s[human].towel === "held") c.pending.push("F1");
      else events.push({ kind: "prompt", text: MSG.towelOnHead });
    }
  } else if (input.shout) {
    if (human && isSauna(s[human].zone)) c.pending.push("F6");
    else if (human) events.push({ kind: "prompt", text: MSG.shoutOutsideSauna });
  } else if (input.push) {
    if (human && npcWithinPushReach(level, human, s[human].pos, s[human].zone)) c.pending.push("F7");
  }

  // 5. Movement stage. Skipped when an action opened a dialog, switched the
  // active character automatically (Req 1.9), or already ended the game.
  if (!s.dialog && s.active === activeBefore && c.pending.length === 0) {
    const walls = wallsFor(level, s.saunaDoor);
    if (s.active === "duck") {
      const d = s.duck;
      if (d.carriedBy === null) {
        if (d.inPond) {
          const r = stepPond(d.pos, d.vel, input.move, walls);
          d.pos = r.pos;
          d.vel = r.vel;
        } else {
          // Outside the pond Duck only swims on water; across the floor a human carries it.
          d.pos = stepDuckWater(d.pos, input.move, walls, level.duckWater);
        }
        d.zone = zoneAtOr(level, d.pos, d.zone);
      }
    } else {
      const id = s.active;
      const before = s[id].pos;
      const next = stepWalk(id, before, input.move, input.run, walls);
      if (next.x !== before.x || next.z !== before.z) {
        applyHumanMove(c, id, next);
        const moved = s[id].pos.x !== before.x || s[id].pos.z !== before.z;
        if (moved && input.run && stepsOnSoap(level, id, s[id].pos)) c.pending.push("F3");
      }
    }
  }

  // Carried Duck sits exactly at its carrier's anchor (Req 2.5).
  const carrier = s.duck.carriedBy;
  if (carrier) {
    s.duck.pos = { ...s[carrier].pos };
    s.duck.zone = s[carrier].zone;
  }

  // 6. Wetness from water zones (Req 6.3, 6.5).
  for (const ch of [s.duck, s.child, s.adult]) {
    if (isWetSource(ch.zone) || inBathWater(level, ch.pos)) ch.wet = "wet";
  }

  // 7. Outcome: game over wins over clear (Req 7.9); then checkpoints.
  s.outcome = decideOutcome(c.pending, isCleared(s));
  if (s.outcome.kind === "gameOver") events.push({ kind: "gameOver", reason: s.outcome.reason });
  else if (s.outcome.kind === "cleared") events.push({ kind: "cleared" });
  else saveCheckpointIfReached(s, level, events);

  return { state: s, events };
}
