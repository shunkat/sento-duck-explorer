// The confirmed 10-step route as input scripts. Each segment only presses keys
// and asserts the result; nothing writes to the game state directly.
import { expect } from "vitest";
import { REACH } from "../../src/core/tuning";
import { LEVEL } from "../../src/level/layout";
import type { Sim } from "./sim";

const N = LEVEL.nodes;

/**
 * Step 2a (2026-11-20 user request): Duck cannot swim from the tub to the coin
 * channel, so Child picks Duck up, walks the short dry stretch to the channel
 * entrance and puts Duck onto the channel. Control passes to Duck.
 */
export function childCarriesDuckToChannel(sim: Sim): void {
  expect(sim.active).toBe("duck");
  sim.switchTo("child");
  sim.approach(sim.pos("duck"), REACH.pickUpDuck);
  sim.press("interact");
  expect(sim.state.duck.carriedBy).toBe("child");
  sim.walk([LEVEL.channelEntrance]);
  sim.press("interact");
  expect(sim.state.duck.carriedBy).toBeNull();
  expect(sim.active).toBe("duck");
}

/** Steps 1–2: Child brings Duck to the channel; Duck swims into the NarrowHole and picks up the coin. */
export function duckGetsCoin(sim: Sim): void {
  childCarriesDuckToChannel(sim);
  sim.walk([{ x: N.narrow_hole_coin.x + 0.2, z: N.narrow_hole_coin.z }]);
  sim.press("interact");
  expect(sim.owner("coin")).toBe("character:duck");
}

/** Step 3: Duck swims back to the channel's end; Adult comes to the entrance; Duck gives the coin (dialog + confirm). */
export function duckGivesCoin(sim: Sim): void {
  sim.walk([{ x: 0.95, z: 5.5 }]);
  sim.switchTo("adult");
  sim.walk([{ x: 3.4, z: 4.8 }, { x: LEVEL.channelEntrance.x, z: 4.9 }]);
  sim.switchTo("duck");
  sim.press("interact");
  expect(sim.state.dialog).toEqual({ item: "coin", from: "duck", to: "adult" });
  sim.press("confirm");
  expect(sim.state.dialog).toBeNull();
  expect(sim.owner("coin")).toBe("character:adult");
}

/** Both humans dry off in the bath and cross into the changing room together. */
export function pairToChanging(sim: Sim): void {
  sim.switchTo("child");
  sim.walk([{ x: 3.6, z: 1.6 }]);
  sim.press("interact");
  expect(sim.state.child.wet).toBe("dry");
  sim.switchTo("adult");
  sim.walk([{ x: 2.6, z: 1.6 }]);
  sim.press("interact");
  expect(sim.state.adult.wet).toBe("dry");
  sim.walk([{ x: 2.6, z: 0.5 }, { x: 2.6, z: -1 }]);
  expect(sim.state.adult.zone).toBe("changing");
  expect(sim.state.child.zone).toBe("changing");
}

/** Both toggle clothing at the locker, ending with Child near the reception door. */
export function pairToggleClothes(sim: Sim, childEnd: { x: number; z: number }): void {
  sim.switchTo("adult");
  sim.walk([{ x: 5.4, z: -2 }]);
  sim.press("interact");
  sim.switchTo("child");
  sim.walk([{ x: 5.5, z: -2.6 }]);
  sim.press("interact");
  sim.walk([childEnd]);
  expect(sim.state.adult.clothing).toBe(sim.state.child.clothing);
}

/** Step 4: Adult (with Child) dresses, pays at reception, returns, undresses, and re-enters the bath. */
export function adultPaysWithChild(sim: Sim): void {
  pairToChanging(sim);
  pairToggleClothes(sim, { x: 3.2, z: -3.0 });
  expect(sim.state.adult.clothing).toBe("clothed");

  sim.switchTo("adult");
  sim.walk([{ x: 2.6, z: -3.2 }, { x: 2.6, z: -5 }]);
  expect(sim.state.adult.zone).toBe("reception");
  expect(sim.state.child.zone).toBe("reception");
  sim.approach(N.reception_desk, REACH.desk);
  sim.press("interact");
  expect(sim.state.items.coin).toEqual({ owner: { kind: "node", id: "reception_register" }, status: "paid" });
  expect(sim.owner("key")).toBe("character:adult");

  sim.walk([{ x: 2.6, z: -5 }, { x: 2.6, z: -3 }]);
  expect(sim.state.child.zone).toBe("changing");
  pairToggleClothes(sim, { x: 3.2, z: -1.0 });
  expect(sim.state.adult.clothing).toBe("unclothed");

  sim.switchTo("adult");
  sim.walk([{ x: 2.6, z: -0.8 }, { x: 2.6, z: 1.5 }]);
  expect(sim.state.adult.zone).toBe("bath");
  expect(sim.state.child.zone).toBe("bath");
  expect(sim.state.lastCheckpoint).toBe("paidReturned");
}

/** Step 5: Adult gives the key to Child. */
export function adultGivesKey(sim: Sim): void {
  sim.switchTo("adult");
  sim.approach(sim.pos("child"), REACH.give);
  sim.press("interact");
  expect(sim.state.dialog).toEqual({ item: "key", from: "adult", to: "child" });
  sim.press("confirm");
  expect(sim.owner("key")).toBe("character:child");
}

/** Walk to `end` near the sauna door around the tub's east side, staying dry (no tub, no channel). */
export function walkDryToSaunaDoor(sim: Sim, end: { x: number; z: number }): void {
  sim.walk([{ x: 7.6, z: 2.5 }, { x: 7.6, z: 7.5 }, end]);
}

/** E at the bath-side drying spot when wet (crossing the Duck's channel wets people). */
export function dryIfWet(sim: Sim): void {
  const id = sim.active;
  if (id !== "duck" && sim.state[id].wet === "wet") {
    sim.press("interact");
    expect(sim.state[id].wet).toBe("dry");
  }
}

/** Adult waits by the sauna door; Child unlocks it. Both cross the channel, so both dry at the door. */
export function childUnlocksSauna(sim: Sim): void {
  sim.switchTo("adult");
  sim.walk([{ x: 1.2, z: 2.5 }, { x: 1.0, z: 7.2 }]);
  dryIfWet(sim);
  sim.switchTo("child");
  sim.walk([{ x: 1.2, z: 2.5 }, { x: 2.0, z: 7.5 }]);
  dryIfWet(sim);
  sim.press("interact");
  expect(sim.state.saunaDoor).toBe("unlocked");
}

const SAUNA_PATH = [
  { x: 6.8, z: 10 },
  { x: 8.5, z: 10 },
  { x: 8.5, z: 9.2 },
  { x: 10.5, z: 9.2 },
  { x: 10.5, z: 10.8 },
  { x: 12.5, z: 10.8 },
];

/** Step 6: Child enters the sauna; Adult is moved in with Child by the pair door. */
export function childEntersSauna(sim: Sim): void {
  sim.walk([{ x: 2.6, z: 7.6 }, { x: 2.6, z: 9.0 }]);
  expect(sim.state.child.zone).toBe("sauna_entry");
  expect(sim.state.adult.zone).toBe("sauna_entry");
}

/** Step 6–7a: Child weaves through the crowd and takes the hat. */
export function childGetsHat(sim: Sim): void {
  sim.walk(SAUNA_PATH);
  sim.approach(N.sauna_hat_shelf, REACH.hat);
  sim.press("interact");
  expect(sim.owner("hat")).toBe("character:child");
  expect(sim.state.adult.zone).toBe("sauna_entry");
}

/** Child walks back out through the gaps and leaves the sauna with Adult. */
export function childLeavesSauna(sim: Sim): void {
  sim.walk([...SAUNA_PATH].reverse());
  sim.walk([{ x: 3.0, z: 9.0 }, { x: 2.6, z: 8.6 }, { x: 2.6, z: 7.3 }]);
  expect(sim.state.child.zone).toBe("bath");
  expect(sim.state.adult.zone).toBe("bath");
}

/** Step 7b: Child puts the hat on Duck. */
export function childEquipsHat(sim: Sim): void {
  sim.switchTo("child");
  sim.approach(sim.pos("duck"), REACH.equip);
  sim.press("interact");
  expect(sim.state.items.hat).toEqual({ owner: { kind: "character", id: "duck" }, status: "equipped" });
  expect(sim.state.lastCheckpoint).toBe("hatEquipped");
}

/** Steps 8–9: Adult carries Duck to the pond entrance with Child, then places Duck in the pond. */
export function adultCarriesDuckToPond(sim: Sim): void {
  sim.switchTo("child");
  sim.walk([{ x: 14.5, z: 3.5 }]);
  sim.switchTo("adult");
  sim.approach(sim.pos("duck"), REACH.pickUpDuck);
  sim.press("interact");
  expect(sim.state.duck.carriedBy).toBe("adult");
  sim.walk([{ x: 15, z: 4 }, { x: 17, z: 4 }, { x: 23, z: 4 }]);
  expect(sim.state.child.zone).toBe("open_air");
  sim.switchTo("child");
  sim.walk([{ x: 22.8, z: 4.8 }]);
  sim.switchTo("adult");
  sim.walk([{ x: 25.5, z: 4 }]);
  expect(sim.state.adult.zone).toBe("pond_entrance");
  expect(sim.state.child.zone).toBe("pond_entrance");
  sim.press("interact");
  expect(sim.active).toBe("duck");
  expect(sim.state.duck.inPond).toBe(true);
  expect(sim.state.duck.carriedBy).toBeNull();
  expect(sim.state.lastCheckpoint).toBe("duckInPond");
}

export const POND_PATH = [
  { x: 29.5, z: 6.5 },
  { x: 33.5, z: 6.5 },
  { x: 33.5, z: 1.5 },
  { x: 37, z: 1.5 },
  { x: 39.2, z: 4 },
];

/** Step 10: Duck rides the current, steering around the rocks into the goal. */
export function duckSwimsToGoal(sim: Sim): void {
  expect(sim.active).toBe("duck");
  sim.walk(POND_PATH, { tol: 0.35, maxTicks: 3000, allowEnd: true });
  expect(sim.state.outcome).toEqual({ kind: "cleared" });
}

/** Everything up to the hat being equipped. */
export function playUntilHatEquipped(sim: Sim): void {
  duckGetsCoin(sim);
  duckGivesCoin(sim);
  adultPaysWithChild(sim);
  adultGivesKey(sim);
  childUnlocksSauna(sim);
  childEntersSauna(sim);
  childGetsHat(sim);
  childLeavesSauna(sim);
  childEquipsHat(sim);
}
