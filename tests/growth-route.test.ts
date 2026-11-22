// Growth and exit (2026-11-21; prototype-core-gameplay Requirement 11): the
// whole route with normal simulated inputs, and where the game may and may
// not clear.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;

describe("growth route by normal inputs", () => {
  it("starts as Duck in the tub with both bottles and both high doors closed", () => {
    const s = createInitialState(LEVEL);
    expect(s.player).toMatchObject({ stage: "duck", zone: "bathwater", wet: "wet", clothing: "unclothed", towel: "none" });
    expect(s.milk).toEqual({ milk1: "available", milk2: "available" });
    expect(s.doors).toEqual({ kidsGate: "closed", frontExit: "closed" });
    expect(Object.keys(s.checkpoints)).toEqual(["start"]);
  });

  it("Duck → milk1 → Child → passage → milk2 → Adult → dry → dress → front exit: clear", () => {
    const sim = new Sim();
    R.fullRoute(sim);
    expect(sim.state.player).toMatchObject({ stage: "adult", zone: "street", wet: "dry", clothing: "clothed" });
    expect(sim.log.filter((e) => e.kind === "grew").map((e) => e.kind === "grew" && e.to)).toEqual(["child", "adult"]);
    expect(sim.log.filter((e) => e.kind === "checkpointSaved").map((e) => e.kind === "checkpointSaved" && e.id)).toEqual(["childGrown", "adultGrown"]);
    expect(sim.log.some((e) => e.kind === "gameOver")).toBe(false);
  });

  it("the cleared state is frozen: later input changes nothing but the tick count", () => {
    const sim = new Sim();
    R.fullRoute(sim);
    const before = sim.state;
    const r = tick(before, { ...EMPTY_INPUT, move: { x: -1, z: 0 }, interact: true, restart: true }, LEVEL);
    expect({ ...r.state, tickCount: 0 }).toEqual({ ...before, tickCount: 0 });
    expect(r.events).toEqual([]);
  });

  it("reception and the genkan never clear, even with the street door open; crossing x = 11 clears once (review R-1)", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    // Walk all over reception and the genkan with the door open.
    const doorway = { x: 7.4, z: -7.0 }; // reception side of the open x = 8 doorway
    const tour = [W.genkanIn, doorway, W.receptionIn, { x: 5.0, z: -7.2 }, doorway, W.genkanIn, { x: 9.5, z: -6.0 }, { x: 10.3, z: -7.8 }, { x: 10.6, z: -7.0 }];
    sim.walk(tour);
    sim.idle(60);
    sim.expectPlaying();
    R.adultLeaves(sim);
    expect(sim.log.filter((e) => e.kind === "cleared")).toHaveLength(1);
  });

  it("the drawn street door, the zone edge and the clear line are the same line", () => {
    const b = LEVEL.highDoors.frontExit.blocker;
    const genkan = LEVEL.zones.find((z) => z.id === "genkan")!.box;
    const street = LEVEL.zones.find((z) => z.id === "street")!.box;
    const line = (b.minX + b.maxX) / 2;
    expect(line).toBe(genkan.maxX);
    expect(line).toBe(street.minX);
    const door = LEVEL.doors.find((d) => d.id === "genkan_street")!.box;
    expect(door).toEqual(b);
    const threshold = LEVEL.decor.find((d) => d.kind === "threshold")!.box;
    expect(threshold.minX).toBe(b.minX);
    expect([threshold.minZ, threshold.maxZ]).toEqual([b.minZ, b.maxZ]);
  });
});

describe("early exit is blocked by the high handle", () => {
  it("the front door does not open for a dressed Child: hint only, and the Child cannot pass", () => {
    // Direct state: a dressed, dry Child in reception (not reachable by the
    // normal route, where the Child is kept in the kids' corner by the gate).
    const sim = new Sim();
    const p = sim.state.player;
    sim.state.milk.milk1 = "collected";
    Object.assign(p, { stage: "child", wet: "dry", clothing: "clothed", towel: "head", pos: { ...W.frontExitIn }, zone: "genkan" });
    const ev = sim.press("interact");
    expect(sim.state.doors.frontExit).toBe("closed");
    expect(ev).toContainEqual({ kind: "rejected", reason: "取っ手が高くて届かない（大人になったら開けられる）" });
    sim.hold({ x: 1, z: 0 }, 120);
    expect(sim.state.player.zone).toBe("genkan");
    sim.expectPlaying();
  });

  it("the Child cannot leave the kids' corner: the gate's latch is too high and the gate blocks", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.walk([W.passageSouth, W.passageNorth, { x: 0.9, z: 3.4 }]); // near the latch, out of milk2's reach
    const ev = sim.press("interact");
    expect(ev.some((e) => e.kind === "rejected")).toBe(true);
    expect(sim.state.doors.kidsGate).toBe("closed");
    sim.hold({ x: 0, z: -1 }, 120);
    expect(sim.state.player.zone).toBe("kids_room");
  });
});

describe("no clear anywhere else", () => {
  it("the Adult walking through the open air and the garden to the pond never clears", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    sim.walk([W.gateIn]);
    sim.press("interact");
    sim.walk([W.gateOut, { x: 3.0, z: 2.3 }, W.bathAisle, W.tubNorth, W.eastAisle, W.openAirDoorBath, W.openAirIn, W.gardenGateOut, W.gardenIn]);
    expect(sim.state.player.zone).toBe("pond_entrance");
    sim.hold({ x: 1, z: 0 }, 200); // the low pond edge keeps the Adult on the shore
    sim.expectPlaying();
    expect(sim.state.player.zone).toBe("pond_entrance");
  });

  it("the old pond goal no longer exists", () => {
    expect(LEVEL.zones.map((z) => z.id)).not.toContain("pond_goal");
  });
});
