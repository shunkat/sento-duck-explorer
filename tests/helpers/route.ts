// The growth route (2026-11-21) as input scripts. Each segment only presses
// keys and asserts the result; nothing writes to the game state directly.
// Places come from LEVEL (nodes, waypoints, doors).
import { expect } from "vitest";
import { LEVEL } from "../../src/level/layout";
import type { Sim } from "./sim";

const W = LEVEL.waypoints;

/** 1: Duck swims from the tub along the trough into the kids' pool and drinks milk1 → Child. */
export function duckDrinksMilk1(sim: Sim): void {
  expect(sim.stage).toBe("duck");
  sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
  sim.press("interact");
  expect(sim.stage).toBe("child");
  expect(sim.state.milk.milk1).toBe("collected");
  expect(sim.state.lastCheckpoint).toBe("childGrown");
}

/** 2: Child walks the child passage into the room and drinks milk2 → Adult. */
export function childDrinksMilk2(sim: Sim): void {
  expect(sim.stage).toBe("child");
  sim.walk([W.passageSouth, W.passageNorth, W.milk2Stand]);
  expect(sim.state.player.zone).toBe("kids_room");
  sim.press("interact");
  expect(sim.stage).toBe("adult");
  expect(sim.state.milk.milk2).toBe("collected");
  expect(sim.state.lastCheckpoint).toBe("adultGrown");
}

/** 3: Adult opens the high-latch gate, dries on the mat, enters the changing room and dresses. */
export function adultDriesAndDresses(sim: Sim): void {
  expect(sim.stage).toBe("adult");
  sim.walk([W.gateIn]);
  sim.press("interact");
  expect(sim.state.doors.kidsGate).toBe("open");
  sim.walk([W.gateOut, W.bathDoorDry]);
  sim.press("interact");
  expect(sim.state.player.wet).toBe("dry");
  sim.walk([W.changingIn]);
  expect(sim.state.player.zone).toBe("changing");
  sim.walk([{ x: LEVEL.locker.x + 0.6, z: LEVEL.locker.z }]);
  sim.press("interact");
  expect(sim.state.player.clothing).toBe("clothed");
}

/** 4: Adult goes round the screen to reception and opens the front exit door. */
export function adultOpensFrontExit(sim: Sim): void {
  sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn, W.frontExitIn]);
  expect(sim.state.player.zone).toBe("reception");
  sim.press("interact");
  expect(sim.state.doors.frontExit).toBe("open");
}

/** 5: Adult crosses into the genkan: clear. */
export function adultLeaves(sim: Sim): void {
  sim.walk([W.genkanIn], { allowEnd: true });
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
