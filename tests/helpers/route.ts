// The growth route (2026-11-21) as input scripts. Each segment only presses
// keys and asserts the result; nothing writes to the game state directly.
// Places come from LEVEL (nodes, waypoints, doors).
import { expect } from "vitest";
import { LEVEL } from "../../src/level/layout";
import type { Sim } from "./sim";

const W = LEVEL.waypoints;

/** Duck collects the tub bottle, then the shallow-pool bottle and grows. */
export function duckDrinksMilk1(sim: Sim): void {
  expect(sim.stage).toBe("duck");
  sim.walk([W.tubMilkSwim]);
  sim.press("interact");
  expect(sim.stage).toBe("duck");
  sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
  sim.press("interact");
  expect(sim.stage).toBe("child");
  expect(sim.state.milk.milk1).toBe("collected");
  expect(sim.state.milk.milk2).toBe("collected");
  expect(sim.state.lastCheckpoint).toBe("childGrown");
}

export function childAsksGuardian(sim: Sim): void {
  sim.walk([W.passageSouth, W.passageNorth, W.gateIn]);
  sim.idle(180); // the adult physically walks around the partition to the gate
  sim.press("interact");
  expect(sim.state.guardian.escortRequested).toBe(true);
  expect(sim.state.doors.kidsGate).toBe("open");
  sim.walk([W.gateOut, { x: 3.1, z: 2.3 }, W.bathMid, W.saunaDoorDry]);
}

/** Dry, wait for the requested adult and enter through the actual sauna door. */
export function childDrinksSaunaMilk(sim: Sim): void {
  sim.press("interact");
  sim.idle(120);
  sim.walk([W.saunaIn, W.saunaMilkStand]);
  sim.press("interact");
  expect(sim.state.milk.milk3).toBe("collected");
}

export function saunaToOpenAir(sim: Sim): void {
  sim.walk([W.saunaIn, W.saunaDoorDry, W.bathMid, W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn,
    { x: 18.8, z: 7.2 }, W.openAirMilkStand]);
}

export function openAirToBath(sim: Sim): void {
  sim.walk([{ x: 18.8, z: 7.2 }, W.openAirIn, W.openAirDoorBath, W.eastAisle, W.tubNorth, W.bathMid, { x: 3.1, z: 2.3 }, W.gateOut]);
}

/** Child visits sauna and open-air bath, collecting both bottles to become Adult. */
export function childDrinksMilk2(sim: Sim): void {
  expect(sim.stage).toBe("child");
  childAsksGuardian(sim);
  childDrinksSaunaMilk(sim);
  expect(sim.stage).toBe("child");
  saunaToOpenAir(sim);
  sim.press("interact");
  expect(sim.stage).toBe("adult");
  expect(sim.state.milk.milk4).toBe("collected");
  expect(sim.state.lastCheckpoint).toBe("adultGrown");
  openAirToBath(sim);
  sim.walk([W.gateIn]); // common start for existing bath/exit regressions
}

/** Adult dries on the mat, enters the changing room and dresses. */
export function adultDriesAndDresses(sim: Sim): void {
  expect(sim.stage).toBe("adult");
  if (sim.state.player.zone === "open_air") openAirToBath(sim);
  else if (sim.state.player.zone.startsWith("sauna")) {
    sim.walk([W.saunaIn, W.saunaDoorDry, W.bathMid, { x: 3.1, z: 2.3 }, W.gateOut]);
  } else sim.walk([W.gateOut]);
  expect(sim.state.doors.kidsGate).toBe("open");
  sim.walk([W.bathDoorDry]);
  sim.press("interact");
  expect(sim.state.player.wet).toBe("dry");
  sim.walk([W.changingIn]);
  expect(sim.state.player.zone).toBe("changing");
  sim.walk([{ x: LEVEL.locker.x + 0.6, z: LEVEL.locker.z }]);
  sim.press("interact");
  expect(sim.state.player.clothing).toBe("clothed");
}

/** 4: Adult goes round the screen through reception into the genkan and opens the street door. */
export function adultOpensFrontExit(sim: Sim): void {
  sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn, W.genkanIn, W.frontExitIn]);
  expect(sim.state.player.zone).toBe("genkan");
  sim.press("interact");
  expect(sim.state.doors.frontExit).toBe("open");
}

/** 5: Adult steps through the street door to the street: clear. */
export function adultLeaves(sim: Sim): void {
  sim.walk([W.streetIn], { allowEnd: true });
  expect(sim.state.outcome).toEqual({ kind: "cleared" });
}

/** The whole route from the start. */
export function fullRoute(sim: Sim): void {
  duckDrinksMilk1(sim);
  childDrinksMilk2(sim);
  adultDriesAndDresses(sim);
  adultOpensFrontExit(sim);
  adultLeaves(sim);
}
