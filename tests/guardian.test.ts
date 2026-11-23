// Real movement, explicit consent and paired sauna entry for the guardian.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { guardianInReach } from "../src/core/actions";
import { guardianReadyForSauna } from "../src/core/guardian";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT, type GameState } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox, distance } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import { inBathWater, isSauna, zoneAt } from "../src/sim/zones";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const r = CHARACTER_RADIUS.adult;
function safe(g: { x: number; z: number }): boolean {
  return ![...LEVEL.walls, ...LEVEL.npcs].some((w) => circleOverlapsBox(g, r - 1e-3, w))
    && !inBathWater(LEVEL, g) && !LEVEL.duckWater.some((w) => circleOverlapsBox(g, r - 1e-3, w));
}
function childAtDoor(): GameState {
  const s = createInitialState(LEVEL);
  s.milk.milk1 = s.milk.milk2 = "collected";
  Object.assign(s.player, { stage: "child", wet: "dry", towel: "head", pos: { x: 11.98, z: 1.8 }, zone: "bath" });
  return s;
}

describe("guardian", () => {
  it("every path segment stays on dry, unobstructed floor for an adult", () => {
    const path = LEVEL.guardianPath;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!; const b = path[i + 1]!;
      for (let t = 0; t <= 1; t += 0.02) {
        const g = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        expect(safe(g), JSON.stringify(g)).toBe(true);
      }
    }
  });

  it("E asks the nearby adult, opens the kids gate, and both visibly walk into the sauna", () => {
    const sim = new Sim();
    const original = sim.step.bind(sim);
    sim.step = (input) => {
      const before = sim.state.guardian.pos;
      const events = original(input);
      expect(safe(sim.state.guardian.pos)).toBe(true);
      expect(distance(before, sim.state.guardian.pos)).toBeLessThanOrEqual(2.5 / 60 + 1e-4);
      return events;
    };
    R.duckDrinksMilk1(sim);
    R.childAsksGuardian(sim);
    expect(sim.state.guardian.escortRequested).toBe(true);
    expect(sim.state.doors.kidsGate).toBe("open");
    R.childDrinksSaunaMilk(sim);
    expect(isSauna(zoneAt(LEVEL, sim.state.guardian.pos)!)).toBe(true);
    expect(sim.log.filter((e) => e.kind === "guardianJoined")).toHaveLength(1);
  });

  it("dry Child cannot enter alone or ask the adult through a distant wall", () => {
    let s = childAtDoor();
    expect(guardianInReach(s, LEVEL)).toBe(false);
    for (let i = 0; i < 40; i++) s = tick(s, { ...EMPTY_INPUT, move: { x: 1, z: 0 }, run: true }, LEVEL).state;
    expect(s.player.zone).toBe("bath");
    expect(s.outcome.kind).toBe("playing");
    expect(s.guardian.escortRequested).toBe(false);
    const wall = childAtDoor();
    wall.player.pos = { x: 2.05, z: 4.0 };
    wall.guardian.pos = { x: 2.9, z: 4.0 };
    expect(guardianInReach(wall, LEVEL)).toBe(false);
  });

  it("request flag is insufficient while the adult is far away; wet entry still triggers F5", () => {
    const s = childAtDoor();
    s.guardian.escortRequested = true;
    expect(guardianReadyForSauna(s, LEVEL)).toBe(false);
    const waiting = tick(s, { ...EMPTY_INPUT, move: { x: 1, z: 0 } }, LEVEL);
    expect(waiting.state.player.zone).toBe("bath");
    expect(waiting.events.some((e) => e.kind === "prompt")).toBe(true);
    s.player.wet = "wet";
    expect(tick(s, { ...EMPTY_INPUT, move: { x: 1, z: 0 } }, LEVEL).state.outcome).toEqual({ kind: "gameOver", reason: "F5" });
  });

  it("running to the final sauna bottle cannot finish the escort before the adult crosses", () => {
    let s = childAtDoor();
    s.milk.milk4 = "collected";
    s.guardian = { pos: { x: 10.95, z: 1.87857 }, at: 6, escortRequested: true };
    let adultEntered = false;
    let childEntered = false;
    for (let i = 0; i < 120 && s.player.stage === "child"; i++) {
      const delta = { x: LEVEL.nodes.milk3.x - s.player.pos.x, z: LEVEL.nodes.milk3.z - s.player.pos.z };
      const length = Math.hypot(delta.x, delta.z);
      const r = tick(s, { ...EMPTY_INPUT, run: true, move: { x: delta.x / length, z: delta.z / length }, interact: length <= 0.6 }, LEVEL);
      s = r.state;
      adultEntered ||= s.guardian.pos.x >= 12.45;
      if (isSauna(s.player.zone)) { childEntered = true; expect(adultEntered).toBe(true); }
    }
    expect(childEntered).toBe(true);
    expect(adultEntered).toBe(true);
    expect(s.player.stage).toBe("adult");
  });

  it("the guardian never becomes a player collision obstacle", () => {
    const s = createInitialState(LEVEL);
    expect(wallsFor(LEVEL, s.doors).some((w) => circleOverlapsBox(s.guardian.pos, 0.01, w))).toBe(false);
  });
});
