// Milk bottles and atomic growth (Requirement 11.2, 11.3).
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { segmentBlocked } from "../src/core/actions";
import { checkInvariants } from "../src/core/invariants";
import { tick } from "../src/core/tick";
import { REACH } from "../src/core/tuning";
import { EMPTY_INPUT, type GameState, type Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const N = LEVEL.nodes;
const W = LEVEL.waypoints;
const E = (s: GameState, extra: Partial<typeof EMPTY_INPUT> = {}) => tick(s, { ...EMPTY_INPUT, interact: true, ...extra }, LEVEL);

/** Direct state: the player at `pos` in `stage` (bottles collected to match). */
function at(stage: "duck" | "child" | "adult", pos: Vec2): GameState {
  const s = createInitialState(LEVEL);
  s.player.stage = stage;
  s.player.pos = { ...pos };
  if (stage !== "duck") {
    s.milk.milk1 = "collected";
    Object.assign(s.player, { towel: "head" });
  }
  if (stage === "adult") s.milk.milk2 = "collected";
  return s;
}

describe("milk pickup rules", () => {
  it("Duck drinks milk1 from the pool within reach; one tick grows it into Child", () => {
    const sim = new Sim();
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    const before = sim.state.player.pos;
    const ev = sim.press("interact");
    expect(ev).toContainEqual({ kind: "grew", milk: "milk1", from: "duck", to: "child" });
    expect(sim.state.player).toMatchObject({ stage: "child", wet: "wet", clothing: "unclothed", towel: "head", vel: { x: 0, z: 0 } });
    expect(sim.state.player.pos).toEqual(before); // the Child fits where the Duck was
  });

  it("out of reach: nothing to do (no growth)", () => {
    const s = at("duck", { x: N.milk1.x, z: N.milk1.z + REACH.milk + 0.2 });
    s.player.zone = "kids_pool";
    const r = E(s);
    expect(r.state.player.stage).toBe("duck");
    expect(r.state.milk.milk1).toBe("available");
  });

  it("not through a wall: a bottle behind the partition cannot be taken", () => {
    // Test level: milk2 moved just east of the partition (x 2.3–2.5); the Child stays in the room.
    const level = { ...LEVEL, nodes: { ...LEVEL.nodes, milk2: { x: 2.6, z: N.milk2.z } } };
    const s = at("child", { x: 2.3 - CHARACTER_RADIUS.child - 0.01, z: N.milk2.z });
    s.player.zone = "kids_room";
    expect(Math.hypot(s.player.pos.x - 2.6, 0)).toBeLessThanOrEqual(REACH.milk);
    const r = tick(s, { ...EMPTY_INPUT, interact: true }, level);
    expect(r.state.milk.milk2).toBe("available");
    expect(r.state.player.stage).toBe("child");
  });

  it("in the real level every spot within reach of a bottle sees it (no bottle is behind a wall)", () => {
    const walls = wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
    for (const id of ["milk1", "milk2"] as const) {
      const n = N[id];
      for (let dx = -REACH.milk; dx <= REACH.milk; dx += 0.05) {
        for (let dz = -REACH.milk; dz <= REACH.milk; dz += 0.05) {
          const p = { x: n.x + dx, z: n.z + dz };
          if (Math.hypot(dx, dz) > REACH.milk || walls.some((w) => circleOverlapsBox(p, 0.15, w))) continue;
          expect(segmentBlocked(p, n, walls), `${id} from ${JSON.stringify(p)}`).toBe(false);
        }
      }
    }
  });

  it("wrong stage and out of order are refused with a hint; nothing changes", () => {
    // Duck at milk2 (out of order), direct state.
    const d = at("duck", { x: N.milk2.x, z: N.milk2.z + 0.3 });
    const r1 = E(d);
    expect(r1.state.milk).toEqual({ milk1: "available", milk2: "available" });
    expect(r1.state.player.stage).toBe("duck");
    expect(r1.events).toContainEqual({ kind: "rejected", reason: "この牛乳びんは子どものときに飲めます" });
    // Child back at milk1? It is collected: no second pickup exists.
    const c = at("child", { x: N.milk1.x, z: N.milk1.z + 0.4 });
    const r2 = E(c);
    expect(r2.state.milk.milk1).toBe("collected");
    expect(r2.state.player.stage).toBe("child");
    expect(r2.events.some((e) => e.kind === "grew")).toBe(false);
  });

  it("each bottle is taken once: E again after growing does not grow twice", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.press("interact"); // milk1 is gone; E now moves the towel
    expect(sim.stage).toBe("child");
    expect(sim.log.filter((e) => e.kind === "grew")).toHaveLength(1);
  });
});

describe("atomic growth", () => {
  it("no extra move in the growth tick, no failure, and the checkpoint is saved", () => {
    const sim = new Sim();
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    const before = sim.state.player.pos;
    const ev = sim.step({ interact: true, move: { x: 1, z: 0 }, run: true });
    expect(sim.state.player.pos).toEqual(before);
    expect(sim.state.outcome).toEqual({ kind: "playing" });
    expect(ev).toContainEqual({ kind: "checkpointSaved", id: "childGrown" });
  });

  it("Child → Adult keeps wetness, clothing and towel", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.press("toggleTowel"); // towel head → hand
    expect(sim.state.player.towel).toBe("held");
    sim.walk([W.passageSouth, W.passageNorth, W.milk2Stand]);
    sim.press("interact");
    expect(sim.state.player).toMatchObject({ stage: "adult", wet: "wet", clothing: "unclothed", towel: "held" });
  });

  it("a stage that does not fit where it stood is moved to the bottle's safe growth spot", () => {
    // Child pressed against the partition (x 2.3) next to milk2: Adult (r 0.35) would overlap.
    const s = at("child", { x: 2.3 - CHARACTER_RADIUS.child - 0.01, z: N.milk2.z });
    s.player.zone = "kids_room";
    expect(Math.hypot(s.player.pos.x - N.milk2.x, 0)).toBeLessThanOrEqual(REACH.milk);
    const r = E(s);
    expect(r.state.player.stage).toBe("adult");
    expect(r.state.player.pos).toEqual(LEVEL.growthSpots.milk2);
    expect(wallsFor(LEVEL, r.state.doors).some((w) => circleOverlapsBox(r.state.player.pos, CHARACTER_RADIUS.adult, w))).toBe(false);
    expect(checkInvariants(r.state)).toEqual([]);
  });

  it("both growth spots fit their new stage and lie in their rooms", () => {
    const walls = wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
    expect(walls.some((w) => circleOverlapsBox(LEVEL.growthSpots.milk1, CHARACTER_RADIUS.child, w))).toBe(false);
    expect(walls.some((w) => circleOverlapsBox(LEVEL.growthSpots.milk2, CHARACTER_RADIUS.adult, w))).toBe(false);
    expect(Math.hypot(LEVEL.growthSpots.milk1.x - N.milk1.x, LEVEL.growthSpots.milk1.z - N.milk1.z)).toBeLessThanOrEqual(REACH.milk + 0.1);
  });
});
