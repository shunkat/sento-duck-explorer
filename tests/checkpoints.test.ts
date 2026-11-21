import { describe, expect, it } from "vitest";
import { toCore } from "../src/core/initialState";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";

const W = LEVEL.waypoints;
import { Sim } from "./helpers/sim";

const restoreAndCheck = (sim: Sim) => {
  expect(sim.state.outcome.kind).toBe("gameOver");
  // Game over freezes everything except restart (Req 10.2).
  const frozen = toCore(sim.state);
  sim.step({ move: { x: 1, z: 0 }, interact: true, switchCharacter: true });
  expect({ ...toCore(sim.state), tickCount: 0 }).toEqual({ ...frozen, tickCount: 0 });
  sim.press("restart");
  sim.expectPlaying();
  expect(sim.state.dialog).toBeNull();
  sim.idle(5); // no immediate repeat failure (Req 10.8)
  sim.expectPlaying();
};

describe("checkpoint restore (Req 5.4, 6.9, 10.3–10.8)", () => {
  it("start: restores the initial state", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.press("dipTowel");
    sim.press("restart");
    expect({ ...toCore(sim.state), tickCount: 0 }).toEqual({ ...sim.state.checkpoints.start!, tickCount: 0 });
    expect(sim.active).toBe("duck");
    expect(sim.owner("coin")).toBe("node:narrow_hole_coin");
    sim.idle(5);
    sim.expectPlaying();
  });

  it("hatEquipped: restore after F3, then finish the route from there", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    R.adultRunsOverSoap(sim);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
    restoreAndCheck(sim);

    expect(sim.state.lastCheckpoint).toBe("hatEquipped");
    expect(sim.state.items.hat).toEqual({ owner: { kind: "character", id: "duck" }, status: "equipped" });
    expect(sim.state.items.coin.status).toBe("paid");
    expect(sim.owner("key")).toBe("character:child");
    expect(sim.state.saunaDoor).toBe("unlocked");
    expect(sim.state.duck.carriedBy).toBeNull();
    for (const id of ["child", "adult"] as const) expect(sim.state[id].zone).toBe("bath");
    expect(sim.state.duck.zone).toBe("bathwater"); // Duck on the water, not the floor

    R.adultCarriesDuckToPond(sim);
    R.duckSwimsToGoal(sim);
  });

  it("duckInPond: saved with both humans on the shore; restore after F3, then reach the goal", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    R.adultCarriesDuckToPond(sim);
    const snap = sim.state.checkpoints.duckInPond!;
    expect(snap.adult.zone).toBe("pond_entrance");
    expect(snap.child.zone).toBe("pond_entrance");
    expect(snap.duck.inPond).toBe(true);
    expect(snap.active).toBe("duck");

    // Walk the pair back to the bath and run onto the soap.
    sim.switchTo("adult");
    sim.walk([W.gardenGateOut]);
    sim.switchTo("child");
    sim.walk([W.openAirIn]);
    sim.switchTo("adult");
    sim.walk([W.openAirIn, W.openAirDoorBath, W.eastAisle, W.tubNorth]);
    R.adultRunsOverSoap(sim);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
    restoreAndCheck(sim);

    expect(sim.state.lastCheckpoint).toBe("duckInPond");
    expect(sim.active).toBe("duck");
    expect(sim.state.duck.inPond).toBe(true);
    expect(sim.state.adult.zone).toBe("pond_entrance");
    expect(sim.state.child.zone).toBe("pond_entrance");
    R.duckSwimsToGoal(sim);
  });
});
