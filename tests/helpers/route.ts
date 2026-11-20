// The confirmed 10-step route as input scripts. Each segment only presses keys
// and asserts the result; nothing writes to the game state directly. Places
// come from LEVEL (nodes, spawns, door boxes, crowd gaps and named waypoints).
import { expect } from "vitest";
import { REACH } from "../../src/core/tuning";
import { LEVEL } from "../../src/level/layout";
import type { Sim } from "./sim";

const N = LEVEL.nodes;
const W = LEVEL.waypoints;

/**
 * Step 2a (2026-11-20 user request): Duck cannot swim from the tub to the coin
 * trough, so Child picks Duck up, walks the short dry stretch to the trough
 * entrance and puts Duck onto the trough. Control passes to Duck.
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

/** Steps 1–2: Child brings Duck to the trough; Duck swims into the NarrowHole and picks up the coin. */
export function duckGetsCoin(sim: Sim): void {
  childCarriesDuckToChannel(sim);
  sim.walk([{ x: N.narrow_hole_coin.x + 0.2, z: N.narrow_hole_coin.z }]);
  sim.press("interact");
  expect(sim.owner("coin")).toBe("character:duck");
}

/** Step 3: Duck swims back to the trough's end; Adult comes beside it; Duck gives the coin (dialog + confirm). */
export function duckStartsCoinTransfer(sim: Sim): void {
  sim.walk([W.troughEnd]);
  sim.switchTo("adult");
  sim.walk([W.troughGive]);
  sim.switchTo("duck");
  sim.press("interact");
  expect(sim.state.dialog).toEqual({ item: "coin", from: "duck", to: "adult" });
}

export function duckGivesCoin(sim: Sim): void {
  duckStartsCoinTransfer(sim);
  sim.press("confirm");
  expect(sim.state.dialog).toBeNull();
  expect(sim.owner("coin")).toBe("character:adult");
}

/** Both humans leave the tub along the dry aisle, dry off on the mat and cross into the changing room together. */
export function pairToChanging(sim: Sim): void {
  sim.switchTo("child");
  sim.walk([W.tubWest, W.bathAisle, W.bathDoorDry]);
  sim.press("interact");
  expect(sim.state.child.wet).toBe("dry");
  sim.switchTo("adult");
  sim.walk([W.tubWest, W.bathAisle, { x: W.bathDoorDry.x - 0.6, z: W.bathDoorDry.z + 0.2 }]);
  sim.press("interact");
  expect(sim.state.adult.wet).toBe("dry");
  sim.walk([W.changingIn]);
  expect(sim.state.adult.zone).toBe("changing");
  expect(sim.state.child.zone).toBe("changing");
}

/** Both toggle clothing at the locker, ending with Child at `childEnd`. */
export function pairToggleClothes(sim: Sim, childEnd: { x: number; z: number }): void {
  const L = LEVEL.locker;
  sim.switchTo("adult");
  sim.walk([{ x: L.x + 0.3, z: L.z }]);
  sim.press("interact");
  sim.switchTo("child");
  sim.walk([{ x: L.x + 0.4, z: L.z + 0.8 }]);
  sim.press("interact");
  sim.walk([childEnd]);
  expect(sim.state.adult.clothing).toBe(sim.state.child.clothing);
}

/** Step 4: Adult (with Child) dresses, goes round the privacy screen, pays at reception, returns, undresses, and re-enters the bath. */
export function adultPaysWithChild(sim: Sim): void {
  pairToChanging(sim);
  pairToggleClothes(sim, W.lockerAisle);
  sim.walk([W.screenPassage, W.screenWait]);
  expect(sim.state.adult.clothing).toBe("clothed");

  sim.switchTo("adult");
  sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn]);
  expect(sim.state.adult.zone).toBe("reception");
  expect(sim.state.child.zone).toBe("reception");
  sim.walk([W.deskFront]);
  sim.press("interact");
  expect(sim.state.items.coin).toEqual({ owner: { kind: "node", id: "reception_register" }, status: "paid" });
  expect(sim.owner("key")).toBe("character:adult");

  sim.walk([W.receptionIn, W.receptionDoorIn]);
  expect(sim.state.child.zone).toBe("changing");
  sim.walk([W.screenPassage, W.lockerAisle]);
  sim.switchTo("child");
  sim.walk([W.screenPassage, W.lockerAisle]);
  pairToggleClothes(sim, { x: W.changingIn.x + 1.0, z: W.changingIn.z });
  expect(sim.state.adult.clothing).toBe("unclothed");

  sim.switchTo("adult");
  sim.walk([W.changingIn, W.bathDoorDry]);
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

/** Walk to `end` near the sauna door along the dry aisle between the washing stations and the tub. */
export function walkDryToSaunaDoor(sim: Sim, end: { x: number; z: number }): void {
  sim.walk([W.bathAisle, W.bathMid, end]);
}

/** E at the bath-side drying spot when wet. */
export function dryIfWet(sim: Sim): void {
  const id = sim.active;
  if (id !== "duck" && sim.state[id].wet === "wet") {
    sim.press("interact");
    expect(sim.state[id].wet).toBe("dry");
  }
}

/** Adult waits by the sauna door; Child unlocks it. Both stay on dry floor. */
export function childUnlocksSauna(sim: Sim): void {
  sim.switchTo("adult");
  walkDryToSaunaDoor(sim, W.saunaWait);
  dryIfWet(sim);
  sim.switchTo("child");
  walkDryToSaunaDoor(sim, W.saunaDoorDry);
  dryIfWet(sim);
  sim.press("interact");
  expect(sim.state.saunaDoor).toBe("unlocked");
}

/** Through each seated row's gap: in front of it, the gap itself, behind it. */
const SAUNA_PATH = LEVEL.crowdGaps.flatMap((g) => {
  const z = (g.box.minZ + g.box.maxZ) / 2;
  const cx = (g.box.minX + g.box.maxX) / 2;
  return [
    { x: g.box.minX - 0.4, z },
    { x: cx, z },
    { x: g.box.maxX + 0.4, z },
  ];
});

/** Step 6: Child enters the sauna; Adult is moved in with Child by the pair door and waits at the entrance. */
export function childEntersSauna(sim: Sim): void {
  sim.walk([W.saunaIn]);
  expect(sim.state.child.zone).toBe("sauna_entry");
  expect(sim.state.adult.zone).toBe("sauna_entry");
}

/** Step 6–7a: Child weaves between the seated rows and takes the hat. */
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
  sim.walk([W.saunaIn, W.saunaDoorDry]);
  expect(sim.state.child.zone).toBe("bath");
  expect(sim.state.adult.zone).toBe("bath");
}

/** Step 7b: Child walks round the tub's north side to Duck and puts the hat on it. */
export function childEquipsHat(sim: Sim): void {
  sim.switchTo("child");
  sim.walk([W.bathMid, W.tubWest]);
  sim.approach(sim.pos("duck"), REACH.equip);
  sim.press("interact");
  expect(sim.state.items.hat).toEqual({ owner: { kind: "character", id: "duck" }, status: "equipped" });
  expect(sim.state.lastCheckpoint).toBe("hatEquipped");
}

/** Step 8: Adult picks up Duck and carries it through the open-air bath to the garden by the pond, Child comes along. */
export function adultCarriesDuckToShore(sim: Sim): void {
  sim.switchTo("child");
  sim.walk([W.tubWest, W.tubNorth, W.eastAisle, W.eastAisleSouth]);
  sim.switchTo("adult");
  sim.walk([W.bathMid, W.tubWest]);
  sim.approach(sim.pos("duck"), REACH.pickUpDuck);
  sim.press("interact");
  expect(sim.state.duck.carriedBy).toBe("adult");
  sim.walk([W.tubWest, W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn, W.gardenGateOut]);
  expect(sim.state.child.zone).toBe("open_air");
  sim.switchTo("child");
  sim.walk([W.gardenGateNear]);
  sim.switchTo("adult");
  sim.walk([W.gardenIn]);
  expect(sim.state.adult.zone).toBe("pond_entrance");
  expect(sim.state.child.zone).toBe("pond_entrance");
}

/** Steps 8–9: Adult carries Duck to the garden with Child, then places Duck in the pond over the low edge. */
export function adultCarriesDuckToPond(sim: Sim): void {
  adultCarriesDuckToShore(sim);
  sim.press("interact");
  expect(sim.active).toBe("duck");
  expect(sim.state.duck.inPond).toBe(true);
  expect(sim.state.duck.carriedBy).toBeNull();
  expect(sim.state.lastCheckpoint).toBe("duckInPond");
}

const POND = LEVEL.zones.find((z) => z.id === "pond")!.box;
/** Around the two rocks into the goal, as offsets from the pond's corner. */
export const POND_PATH = [
  { x: 2.5, z: 6.5 },
  { x: 6.5, z: 6.5 },
  { x: 6.5, z: 1.5 },
  { x: 10, z: 1.5 },
  { x: 12.2, z: 4 },
].map((p) => ({ x: POND.minX + p.x, z: POND.minZ + p.z }));

/** Step 10: Duck rides the current, steering around the rocks into the goal. */
export function duckSwimsToGoal(sim: Sim): void {
  expect(sim.active).toBe("duck");
  sim.walk(POND_PATH, { tol: 0.35, maxTicks: 3000, allowEnd: true });
  expect(sim.state.outcome).toEqual({ kind: "cleared" });
}

/** F3 by input: walk up the aisle in front of the soap, then run onto it (between two stools). */
export function adultRunsOverSoap(sim: Sim): void {
  const soap = LEVEL.soaps[0]!.pos;
  sim.switchTo("adult");
  sim.walk([W.bathMid, { x: soap.x, z: soap.z + 1.4 }]);
  sim.walk([{ x: soap.x, z: soap.z }], { run: true, allowEnd: true });
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
