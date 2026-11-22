// Three checkpoints (Requirement 11.6): start, after Child growth, after
// Adult growth. Restores bring back the whole state together and the route
// continues to the exit.
import { describe, expect, it } from "vitest";
import { takeSnapshot } from "../src/core/checkpoints";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;

describe("checkpoints", () => {
  it("only start, childGrown and adultGrown exist", () => {
    const sim = new Sim();
    R.fullRoute(sim);
    expect(Object.keys(sim.state.checkpoints).sort()).toEqual(["adultGrown", "childGrown", "start"]);
  });

  it("childGrown: F1 → R restores the Child in the pool with milk1 taken once; the route continues to clear", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.walk([W.passageSouth]);
    sim.press("toggleTowel"); // towel to the hand
    sim.walk([W.passageSouth, { x: 0.6, z: 7.6 }]); // back into the pool
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
    sim.press("restart");
    expect(sim.state.player).toMatchObject({ stage: "child", pos: LEVEL.growthSpots.milk1, wet: "wet", clothing: "unclothed", towel: "head" });
    expect(sim.state.milk).toEqual({ milk1: "collected", milk2: "available" });
    expect(sim.state.guardian).toEqual({ pos: LEVEL.guardianPath[0], at: 0 });
    sim.idle(30);
    sim.expectPlaying();
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
    expect(sim.log.filter((e) => e.kind === "grew")).toHaveLength(2);
  });

  it("adultGrown: the snapshot keeps both bottles, closed doors, the Adult's state and the guardian at rest", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    const snap = sim.state.checkpoints.adultGrown!;
    expect(snap.player).toMatchObject({ stage: "adult", pos: LEVEL.growthSpots.milk2, wet: "wet", clothing: "unclothed", towel: "head", vel: { x: 0, z: 0 } });
    expect(snap.milk).toEqual({ milk1: "collected", milk2: "collected" });
    expect(snap.doors).toEqual({ kidsGate: "closed", frontExit: "closed" });
    expect(snap.guardian).toEqual({ pos: LEVEL.guardianPath[2], at: 2 });
    expect(snap.outcome).toEqual({ kind: "playing" });
  });

  it("restoring after the doors were opened puts back the snapshot's doors (no growth reversal, no duplicate bottles)", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn]);
    sim.walk([W.frontExitIn]);
    sim.press("interact");
    expect(sim.state.doors.frontExit).toBe("open");
    // F8 in the lobby, then R.
    sim.walk([{ x: 4.8, z: -7.0 }, { x: 1.0, z: -7.0 }]);
    sim.hold({ x: -1, z: 0 }, 60);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F8" });
    sim.press("restart");
    expect(sim.state.player.stage).toBe("adult");
    expect(sim.state.milk).toEqual({ milk1: "collected", milk2: "collected" });
    expect(sim.state.doors).toEqual({ kidsGate: "closed", frontExit: "closed" });
    expect(sim.state.lastCheckpoint).toBe("adultGrown");
  });

  it("every snapshot spot fits its stage without overlapping a wall", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    for (const id of ["childGrown", "adultGrown"] as const) {
      const snap = takeSnapshot(sim.state, id, LEVEL);
      const r = CHARACTER_RADIUS[sim.state.player.stage];
      expect(wallsFor(LEVEL, snap.doors).some((w) => circleOverlapsBox(snap.player.pos, r, w)), id).toBe(false);
    }
  });
});
