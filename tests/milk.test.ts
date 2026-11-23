// Four unique bottles, two per growth, with atomic state and safe fallback.
import { describe, expect, it } from "vitest";
import { createInitialState, zoneOf } from "../src/core/initialState";
import { segmentBlocked } from "../src/core/actions";
import { checkInvariants } from "../src/core/invariants";
import { tick } from "../src/core/tick";
import { REACH } from "../src/core/tuning";
import { EMPTY_INPUT, MILK_IDS, type GameState, type Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const N = LEVEL.nodes;
const W = LEVEL.waypoints;
const E = (s: GameState, extra: Partial<typeof EMPTY_INPUT> = {}) => tick(s, { ...EMPTY_INPUT, interact: true, ...extra }, LEVEL);
function at(stage: "duck" | "child" | "adult", pos: Vec2): GameState {
  const s = createInitialState(LEVEL);
  Object.assign(s.player, { stage, pos: { ...pos }, zone: zoneOf(LEVEL, pos) });
  if (stage !== "duck") {
    s.milk.milk1 = s.milk.milk2 = "collected";
    s.player.towel = "head";
  }
  if (stage === "adult") s.milk.milk3 = s.milk.milk4 = "collected";
  return s;
}

describe("milk pickup rules", () => {
  it("the first bottle keeps Duck; the second grows Child exactly once", () => {
    const sim = new Sim();
    sim.walk([W.tubMilkSwim]);
    const first = sim.press("interact");
    expect(first).toContainEqual({ kind: "milkCollected", milk: "milk1", collected: 1, required: 2 });
    expect(first.some((e) => e.kind === "grew")).toBe(false);
    expect(sim.stage).toBe("duck");
    sim.press("interact");
    expect(sim.state.milk.milk2).toBe("available");
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    const before = sim.pos();
    const events = sim.step({ interact: true, move: { x: 1, z: 0 }, run: true });
    expect(events).toContainEqual({ kind: "grew", milk: "milk2", from: "duck", to: "child" });
    expect(sim.state.player).toMatchObject({ stage: "child", wet: "wet", clothing: "unclothed", towel: "head", vel: { x: 0, z: 0 } });
    expect(sim.pos()).toEqual(before);
    expect(sim.state.lastCheckpoint).toBe("childGrown");
    sim.press("interact");
    expect(sim.log.filter((e) => e.kind === "grew")).toHaveLength(1);
  });

  it("pool then tub also grows safely and the Child can reach the guardian", () => {
    const sim = new Sim();
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    sim.press("interact");
    expect(sim.stage).toBe("duck");
    sim.walk([W.poolIn, W.troughGap, W.tubWestDeep, W.tubMilkSwim]);
    sim.press("interact");
    expect(sim.stage).toBe("child");
    sim.walk([W.tubNorth, W.bathAisle, { x: 3.1, z: 2.3 }, W.gateOut]);
    sim.press("interact");
    expect(sim.state.guardian.escortRequested).toBe(true);
  });

  it("out of reach leaves the bottle available", () => {
    const s = at("duck", { x: N.milk1.x, z: N.milk1.z + REACH.milk + 0.2 });
    const r = E(s);
    expect(r.state.milk.milk1).toBe("available");
    expect(r.state.player.stage).toBe("duck");
  });

  it("cannot pick up a bottle through a partition", () => {
    const level = { ...LEVEL, nodes: { ...N, milk3: { x: 2.6, z: 3.5 } } };
    const s = at("child", { x: 2.04, z: 3.5 });
    const r = tick(s, { ...EMPTY_INPUT, interact: true }, level);
    expect(r.state.milk.milk3).toBe("available");
  });

  it("all actual bottles have a reachable side with a clear line", () => {
    const points = [W.tubMilkSwim, W.milk1Swim, W.saunaMilkStand, W.openAirMilkStand];
    const walls = wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
    MILK_IDS.forEach((id, i) => {
      const p = points[i]!;
      expect(Math.hypot(p.x - N[id].x, p.z - N[id].z)).toBeLessThanOrEqual(REACH.milk);
      expect(segmentBlocked(p, N[id], walls)).toBe(false);
    });
  });

  it("Duck cannot collect either Child bottle, even if placed within reach", () => {
    for (const id of ["milk3", "milk4"] as const) {
      const r = E(at("duck", N[id]));
      expect(r.state.milk[id]).toBe("available");
      expect(r.events).toContainEqual({ kind: "rejected", reason: "この牛乳びんは子どものときに飲めます" });
    }
  });
});

describe("Child growth", () => {
  it("one Child bottle is insufficient, and the second preserves dry/clothing/towel state", () => {
    let s = at("child", W.openAirMilkStand);
    Object.assign(s.player, { wet: "dry", clothing: "clothed", towel: "held" });
    s = E(s).state;
    expect(s.player.stage).toBe("child");
    Object.assign(s.player, { pos: W.saunaMilkStand, zone: "sauna_entry" });
    const grown = E(s, { move: { x: 1, z: 0 } });
    expect(grown.state.player).toMatchObject({ stage: "adult", wet: "dry", clothing: "clothed", towel: "held", pos: W.saunaMilkStand });
    expect(checkInvariants(grown.state)).toEqual([]);
  });

  it("growth next to a wall uses a safe fallback for the larger body", () => {
    const s = at("child", { x: N.milk3.x, z: 0.36 });
    s.player.wet = "dry";
    s.milk.milk4 = "collected";
    const grown = E(s);
    expect(grown.state.player.stage).toBe("adult");
    expect(grown.state.player.pos).toEqual(LEVEL.growthSpots.milk3);
    expect(wallsFor(LEVEL, grown.state.doors).some((w) => circleOverlapsBox(grown.state.player.pos, CHARACTER_RADIUS.adult, w))).toBe(false);
  });

  it("every bottle's safe spot fits the stage that may grow there", () => {
    const walls = wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
    for (const id of MILK_IDS) {
      const radius = id === "milk1" || id === "milk2" ? CHARACTER_RADIUS.child : CHARACTER_RADIUS.adult;
      expect(walls.some((w) => circleOverlapsBox(LEVEL.growthSpots[id], radius, w)), id).toBe(false);
    }
  });

  it("open air first, then accompanied sauna, grows Adult with a walkable exit", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childAsksGuardian(sim);
    sim.walk([W.bathMid, W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn, { x: 18.8, z: 7.2 }, W.openAirMilkStand]);
    sim.press("interact");
    expect(sim.stage).toBe("child");
    R.openAirToBath(sim);
    sim.walk([{ x: 3.1, z: 2.3 }, W.bathMid, W.saunaDoorDry]);
    R.childDrinksSaunaMilk(sim);
    expect(sim.stage).toBe("adult");
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
  });
});
