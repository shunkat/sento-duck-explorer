// F1–F8 on the one player (growth and exit, 2026-11-21): unchanged rules,
// applied while the player is human; Duck triggers none. Restart is safe.
import { describe, expect, it } from "vitest";
import { decideOutcome } from "../src/core/rules";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const over = (sim: Sim, reason: string) => expect(sim.state.outcome).toEqual({ kind: "gameOver", reason });

/** Adult just grown, gate opened, standing outside the kids' corner (wet, unclothed). */
function adultOut(): Sim {
  const sim = new Sim();
  R.duckDrinksMilk1(sim);
  R.childDrinksMilk2(sim);
  sim.walk([W.gateIn]);
  sim.press("interact");
  sim.walk([W.gateOut]);
  return sim;
}

describe("Duck triggers no failure", () => {
  it("Q, V and F as Duck do nothing", () => {
    const sim = new Sim();
    for (const k of ["dipTowel", "shout", "push"] as const) sim.press(k);
    sim.expectPlaying();
  });
});

describe("F1–F8 for the human player", () => {
  it("F1: Child dips a held towel in the pool; on the head it only shows a hint", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim); // towel on the head, standing in the pool
    const ev = sim.press("dipTowel");
    expect(ev).toContainEqual({ kind: "prompt", text: "タオルは頭の上にあります（手に持つ操作で持てます）" });
    sim.expectPlaying();
    sim.press("toggleTowel"); // towel to the hand
    sim.press("dipTowel");
    over(sim, "F1");
  });

  it("F2: the wet Adult enters the changing room without drying", () => {
    const sim = adultOut();
    sim.walk([W.bathDoorDry, W.changingIn], { allowEnd: true });
    over(sim, "F2");
  });

  it("F3: running onto the soap; walking over it is safe", () => {
    const sim = adultOut();
    const soap = LEVEL.soaps[0]!.pos;
    sim.walk([{ x: 3.0, z: 2.3 }, { x: soap.x, z: 1.6 }, soap, { x: soap.x, z: 1.6 }]);
    sim.expectPlaying();
    sim.walk([soap], { run: true, allowEnd: true });
    over(sim, "F3");
  });

  it("F4: leaving the changing room for reception unclothed", () => {
    const sim = adultOut();
    sim.walk([W.bathDoorDry]);
    sim.press("interact");
    sim.walk([W.changingIn, W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn], { allowEnd: true });
    over(sim, "F4");
  });

  it("F5: entering the sauna wet; F6 shouting and F7 pushing inside it, dry", () => {
    const wet = adultOut();
    wet.walk([{ x: 3.0, z: 2.3 }, W.bathMid, W.saunaDoorDry, W.saunaIn], { allowEnd: true });
    over(wet, "F5");

    for (const [key, id] of [["shout", "F6"], ["push", "F7"]] as const) {
      const sim = adultOut();
      sim.walk([{ x: 3.0, z: 2.3 }, W.bathMid, W.saunaDoorDry]);
      sim.press("interact"); // dry at the sauna door
      sim.walk([W.saunaIn, { x: 13.6, z: 1.9 }]);
      expect(sim.state.player.zone).toBe("sauna_entry");
      sim.press(key);
      over(sim, id);
    }
  });

  it("walking through the sauna rows' area without pushing is not F7", () => {
    const sim = adultOut();
    sim.walk([{ x: 3.0, z: 2.3 }, W.bathMid, W.saunaDoorDry]);
    sim.press("interact");
    sim.walk([W.saunaIn, { x: 13.6, z: 1.9 }]);
    sim.hold({ x: 1, z: 0 }, 60); // into the first row (blocked, Adult does not fit a gap)
    sim.expectPlaying();
  });

  it("F8: the dressed Adult pushes into the women's entrance from the lobby", () => {
    const sim = adultOut();
    sim.walk([W.bathDoorDry]);
    sim.press("interact");
    sim.walk([W.changingIn, { x: LEVEL.locker.x + 0.6, z: LEVEL.locker.z }]);
    sim.press("interact");
    sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn, { x: 4.8, z: -7.0 }, { x: 1.0, z: -7.0 }]);
    sim.hold({ x: -1, z: 0 }, 60);
    over(sim, "F8");
  });
});

describe("priority and restart", () => {
  it("F1 … F8 in order; any failure beats clear on the same tick", () => {
    expect(decideOutcome(["F8", "F1"], true)).toEqual({ kind: "gameOver", reason: "F1" });
    expect(decideOutcome(["F8"], true)).toEqual({ kind: "gameOver", reason: "F8" });
    expect(decideOutcome([], true)).toEqual({ kind: "cleared" });
  });

  it("running onto a soap placed on the street-door boundary: F3 wins over the clear in the same tick", () => {
    const level = { ...LEVEL, soaps: [{ pos: { x: 11.15, z: -7.0 }, radius: 0.15 }] };
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    sim.walk([{ x: 10.6, z: -7.0 }]);
    let s = sim.state;
    for (let i = 0; i < 60 && s.outcome.kind === "playing"; i++) s = tick(s, { ...EMPTY_INPUT, move: { x: 1, z: 0 }, run: true }, level).state;
    expect(s.outcome).toEqual({ kind: "gameOver", reason: "F3" });
  });

  it("game over freezes input; R restores the last growth checkpoint and the route still clears", () => {
    const sim = adultOut();
    sim.walk([W.bathDoorDry, W.changingIn], { allowEnd: true });
    over(sim, "F2");
    const frozen = sim.state.player.pos;
    sim.step({ move: { x: 1, z: 0 }, interact: true });
    expect(sim.state.player.pos).toEqual(frozen);
    sim.press("restart");
    sim.expectPlaying();
    expect(sim.state.player).toMatchObject({ stage: "adult", pos: LEVEL.growthSpots.milk2, wet: "wet", clothing: "unclothed" });
    expect(sim.state.doors.kidsGate).toBe("closed");
    sim.idle(30);
    sim.expectPlaying();
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
  });
});
