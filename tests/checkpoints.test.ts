// Restore each bottle milestone and the escort atomically, without duplication.
import { describe, expect, it } from "vitest";
import { restoreLatest, takeSnapshot } from "../src/core/checkpoints";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const allMilk = { milk1: "collected", milk2: "collected", milk3: "collected", milk4: "collected" };

describe("checkpoints", () => {
  it("saves every bottle milestone and the escort request", () => {
    const sim = new Sim();
    R.fullRoute(sim);
    expect(Object.keys(sim.state.checkpoints).sort()).toEqual(["adultGrown", "childGrown", "childMilkFound", "duckMilkFound", "escortJoined", "start"]);
  });

  it("first Duck bottle snapshot keeps progress without growing or duplicating it", () => {
    const sim = new Sim();
    sim.walk([W.tubMilkSwim]);
    sim.press("interact");
    sim.state = restoreLatest(sim.state);
    expect(sim.stage).toBe("duck");
    expect(sim.state.milk).toEqual({ milk1: "collected", milk2: "available", milk3: "available", milk4: "available" });
    sim.press("interact");
    expect(sim.stage).toBe("duck");
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    sim.press("interact");
    expect(sim.stage).toBe("child");
  });

  it("childGrown: F1/R restores both Duck bottles and the original guardian position", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    const snap = structuredClone(sim.state.checkpoints.childGrown!);
    sim.press("toggleTowel");
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
    sim.press("restart");
    expect(sim.state.player).toMatchObject({ stage: "child", pos: LEVEL.growthSpots.milk2, wet: "wet", clothing: "unclothed", towel: "head" });
    expect(sim.state.milk).toEqual({ milk1: "collected", milk2: "collected", milk3: "available", milk4: "available" });
    expect(sim.state.guardian).toEqual(snap.guardian);
    sim.idle(30);
    sim.expectPlaying();
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
  });

  it("after asking, F5/R keeps the open gate and request but never teleports the adult to sauna", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childAsksGuardian(sim);
    const snap = structuredClone(sim.state.checkpoints.escortJoined!);
    expect(snap.guardian.pos.x).toBeLessThan(2);
    sim.walk([W.saunaIn], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F5" });
    sim.press("restart");
    expect(sim.state.guardian).toEqual(snap.guardian);
    expect(sim.state.guardian.escortRequested).toBe(true);
    expect(sim.state.doors.kidsGate).toBe("open");
    sim.idle();
    sim.expectPlaying();
  });

  it("after the first Child bottle, F6/R preserves milk, dry body and adult already inside", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childAsksGuardian(sim);
    R.childDrinksSaunaMilk(sim);
    const snap = structuredClone(sim.state.checkpoints.childMilkFound!);
    sim.press("shout");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F6" });
    sim.press("restart");
    expect(sim.state.player).toEqual(snap.player);
    expect(sim.state.guardian).toEqual(snap.guardian);
    expect(sim.state.milk.milk3).toBe("collected");
    expect(sim.state.milk.milk4).toBe("available");
    sim.idle(30);
    sim.expectPlaying();
    R.saunaToOpenAir(sim);
    sim.press("interact");
    expect(sim.stage).toBe("adult");
  });

  it("asking after open-air-first keeps that milk in the newer escort checkpoint", () => {
    const sim = new Sim();
    // Pool first means Child grows in the tub and can explore before asking.
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    sim.press("interact");
    sim.walk([W.poolIn, W.troughGap, W.tubWestDeep, W.tubMilkSwim]);
    sim.press("interact");
    sim.walk([W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn, { x: 18.8, z: 7.2 }, W.openAirMilkStand]);
    sim.press("interact");
    expect(sim.state.lastCheckpoint).toBe("childMilkFound");
    expect(sim.state.guardian.escortRequested).toBe(false);
    R.openAirToBath(sim);
    sim.press("interact");
    expect(sim.state.lastCheckpoint).toBe("escortJoined");
    sim.walk([{ x: 3.1, z: 2.3 }, W.bathMid, W.saunaDoorDry, W.saunaIn], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F5" });
    sim.press("restart");
    expect(sim.state.milk.milk4).toBe("collected");
    expect(sim.state.milk.milk3).toBe("available");
    expect(sim.state.guardian.escortRequested).toBe(true);
    sim.walk([{ x: 3.1, z: 2.3 }, W.bathMid, W.saunaDoorDry]);
    R.childDrinksSaunaMilk(sim);
    expect(sim.stage).toBe("adult");
  });

  it("adultGrown restores all four bottles, guardian and door state after F8, then clears", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    const snap = structuredClone(sim.state.checkpoints.adultGrown!);
    expect(snap.player).toMatchObject({ stage: "adult", pos: LEVEL.growthSpots.milk4, wet: "wet", clothing: "unclothed", towel: "head" });
    expect(snap.milk).toEqual(allMilk);
    expect(snap.doors).toEqual({ kidsGate: "open", frontExit: "closed" });
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    sim.walk([W.genkanIn, { x: 7.4, z: -7.0 }, { x: 4.8, z: -7.0 }, { x: 1.0, z: -7.0 }]);
    sim.hold({ x: -1, z: 0 }, 60);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F8" });
    sim.press("restart");
    expect(sim.state.player).toEqual(snap.player);
    expect(sim.state.guardian).toEqual(snap.guardian);
    expect(sim.state.milk).toEqual(allMilk);
    expect(sim.state.doors).toEqual(snap.doors);
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
  });

  it("all snapshots fit their actual stage and preserve safe current position when copied", () => {
    const sim = new Sim();
    R.fullRoute(sim);
    for (const snap of Object.values(sim.state.checkpoints)) {
      const r = CHARACTER_RADIUS[snap.player.stage];
      expect(wallsFor(LEVEL, snap.doors).some((w) => circleOverlapsBox(snap.player.pos, r - 1e-3, w))).toBe(false);
    }
    const copy = takeSnapshot(sim.state, "adultGrown", LEVEL);
    expect(copy.player.pos).toEqual(sim.state.player.pos);
  });
});
