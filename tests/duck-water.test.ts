// Duck swims only on water outside the pond; it leaves the bath only in
// Adult's arms (2026-11-20 user correction). Every Sim tick also checks that a
// free Duck's whole body is on the water (tests/helpers/sim.ts duckOnWater).
import { describe, expect, it } from "vitest";
import { duckDropPoint } from "../src/core/actions";
import { MSG } from "../src/core/text";
import { REACH } from "../src/core/tuning";
import type { Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { shoreBoxes, stepDuckWater, wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { duckOnWater, Sim } from "./helpers/sim";

const r = CHARACTER_RADIUS.duck;
const walls = wallsFor(LEVEL, "locked");
const shore = shoreBoxes(LEVEL.duckWater);
const bodyOnLand = (p: Vec2) => shore.some((b) => circleOverlapsBox(p, r - 1e-3, b));

/** Hold one direction for n ticks with the real step; return every position. */
function hold(from: Vec2, move: Vec2, n: number): Vec2[] {
  const path = [from];
  let p = from;
  for (let i = 0; i < n; i++) path.push((p = stepDuckWater(p, move, walls, LEVEL.duckWater)));
  return path;
}

describe("Duck on the bath water", () => {
  it("stops at the tub edge in all four directions and both diagonals; body never on land", () => {
    const c = { x: 4.5, z: 5 };
    const tub = LEVEL.duckWater[0]!;
    const cases: [Vec2, (p: Vec2) => void][] = [
      [{ x: 1, z: 0 }, (p) => expect(p.x).toBeCloseTo(tub.maxX - r, 3)],
      [{ x: 0, z: 1 }, (p) => expect(p.z).toBeCloseTo(tub.maxZ - r, 3)],
      [{ x: 0, z: -1 }, (p) => expect(p.z).toBeCloseTo(tub.minZ + r, 3)],
      [{ x: Math.SQRT1_2, z: -Math.SQRT1_2 }, (p) => expect([p.x, p.z].map((v) => +v.toFixed(3))).toEqual([+(tub.maxX - r).toFixed(3), +(tub.minZ + r).toFixed(3)])],
      [{ x: Math.SQRT1_2, z: Math.SQRT1_2 }, (p) => expect([p.x, p.z].map((v) => +v.toFixed(3))).toEqual([+(tub.maxX - r).toFixed(3), +(tub.maxZ - r).toFixed(3)])],
      [{ x: -Math.SQRT1_2, z: -Math.SQRT1_2 }, (p) => expect([p.x, p.z].map((v) => +v.toFixed(3))).toEqual([+(tub.minX + r).toFixed(3), +(tub.minZ + r).toFixed(3)])],
    ];
    for (const [move, end] of cases) {
      const path = hold(c, move, 400);
      for (const p of path) expect(bodyOnLand(p)).toBe(false);
      end(path.at(-1)!);
    }
    // −X from the tub center: the west edge, except at the channel mouth.
    const west = hold({ x: 4.5, z: 4 }, { x: -1, z: 0 }, 400).at(-1)!;
    expect(west.x).toBeCloseTo(tub.minX + r, 3);
  });

  it("glides along an edge: diagonal into the north edge keeps moving along it", () => {
    const path = hold({ x: 3, z: 3.5 }, { x: Math.SQRT1_2, z: -Math.SQRT1_2 }, 120);
    const end = path.at(-1)!;
    expect(end.z).toBeCloseTo(3 + r, 3);
    expect(end.x).toBeGreaterThan(4); // kept sliding east
  });

  it("concave corner at the channel → tub joint: the diagonal does not cut the land corner", () => {
    // In the channel just west of the tub, push (+x, −z) toward the land corner at (2, 5.3).
    const start = { x: 1.9, z: 5.5 };
    const path = hold(start, { x: Math.SQRT1_2, z: -Math.SQRT1_2 }, 200);
    for (const p of path) {
      expect(bodyOnLand(p)).toBe(false);
      // The land corner at (2, 5.3) stays outside the body (sub-mm contact slack only).
      if (p.x < 2 && p.z < 5.3 + r) expect(Math.hypot(p.x - 2, p.z - 5.3)).toBeGreaterThanOrEqual(r - 1e-3);
    }
    expect(path.at(-1)!.x).toBeGreaterThan(2.2); // went on into the tub
  });

  it("a start point on the floor (or without clearance) does not move: no push-out jump onto the water", () => {
    for (const from of [{ x: 1.99, z: 5.29 }, { x: 1.0, z: 4.0 }, { x: 4.5, z: 2.9 }]) {
      for (const move of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
        expect(stepDuckWater(from, move, walls, LEVEL.duckWater)).toEqual(from);
      }
    }
  });

  it("channel joints are open both ways, and humans still cannot enter the hole", () => {
    const toHole = hold({ x: 3, z: 5.5 }, { x: -1, z: 0 }, 400);
    for (const p of toHole) expect(bodyOnLand(p)).toBe(false);
    expect(toHole.at(-1)!.x).toBeLessThan(-2.5); // through tub → channel → hole
    const back = hold(toHole.at(-1)!, { x: 1, z: 0 }, 400);
    expect(back.at(-1)!.x).toBeGreaterThan(6); // and back into the tub
    const sim = new Sim();
    sim.switchTo("child");
    for (let i = 0; i < 200; i++) sim.step({ move: { x: -1, z: 0.05 } });
    expect(sim.state.child.zone).not.toBe("narrow_hole");
  });

  it("hole round trip with the real input path: coin, then back to the tub", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    sim.walk([{ x: 1, z: 5.5 }, { x: 4, z: 5 }]);
    expect(sim.state.duck.zone).toBe("bathwater");
  });

  it("the floor and the splash are not water: Duck cannot walk onto them", () => {
    const sim = new Sim();
    for (let i = 0; i < 300; i++) sim.step({ move: { x: 0, z: -1 } }); // toward the changing-room door
    expect(sim.state.duck.zone).toBe("bathwater");
    for (let i = 0; i < 600; i++) sim.step({ move: { x: 1, z: 0 } }); // toward the splash and the open-air door
    expect(sim.state.duck.zone).toBe("bathwater");
  });
});

describe("carrying and putting Duck down", () => {
  it("carried Duck ignores its own input", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    const adult = { ...sim.pos("adult") };
    sim.switchTo("duck");
    for (let i = 0; i < 60; i++) sim.step({ move: { x: 1, z: 0 } });
    expect(sim.pos("adult")).toEqual(adult);
    expect(sim.pos("duck")).toEqual(adult);
  });

  it("no drop on the floor, outside the bath, or across a wall; Duck stays held", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.switchTo("child");
    sim.walk([{ x: 14.5, z: 3.5 }]);
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    sim.walk([{ x: 15, z: 4 }, { x: 17, z: 4 }]);
    expect(sim.state.adult.zone).toBe("open_air");
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("adult");
    expect(sim.lastEvents).toContainEqual({ kind: "rejected", reason: MSG.cannotPutDuckHere });
    // A spot just behind the west wall of the hole corridor: water is near, but a wall is in between.
    const s = structuredClone(sim.state);
    s.adult.pos = { x: -1.5, z: 5.0 };
    s.adult.zone = "bath";
    expect(duckDropPoint(s, LEVEL)).toBeNull();
  });

  it("the drop point is on the water with the whole body, within reach", () => {
    const s = new Sim().state;
    s.adult.pos = { x: 7.6, z: 6.5 };
    s.adult.zone = "bath";
    const p = duckDropPoint(s, LEVEL)!;
    expect(p).not.toBeNull();
    expect(bodyOnLand(p)).toBe(false);
    expect(Math.hypot(p.x - 7.6, p.z - 6.5)).toBeLessThanOrEqual(REACH.pickUpDuck);
  });
});

describe("every checkpoint keeps a free Duck on the water", () => {
  it("start, paidReturned and hatEquipped snapshots, and duckInPond in the pond", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    R.adultCarriesDuckToPond(sim);
    const cps = sim.state.checkpoints;
    for (const id of ["start", "paidReturned", "hatEquipped"] as const) {
      const snap = cps[id]!;
      expect(snap.duck.carriedBy).toBeNull();
      expect(duckOnWater(snap)).toEqual([]);
    }
    expect(cps.duckInPond!.duck.inPond).toBe(true);
    expect(LEVEL.checkpointSpawns.hatEquipped.duck).toEqual({ x: 6.6, z: 6 });
  });

  it("restoring hatEquipped puts Duck on the water and the route continues", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.switchTo("adult");
    sim.walk([{ x: 10.5, z: 5 }]);
    sim.walk([{ x: 13.5, z: 5 }], { run: true, allowEnd: true });
    sim.press("restart");
    expect(sim.state.lastCheckpoint).toBe("hatEquipped");
    expect(duckOnWater(sim.state)).toEqual([]);
    R.adultCarriesDuckToPond(sim);
    R.duckSwimsToGoal(sim);
  });
});

describe("the channel is water for people too", () => {
  it("walking across the channel wets a dry human (real input), and E at the sauna door dries again", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    sim.press("interact");
    expect(sim.state.child.wet).toBe("dry");
    sim.walk([{ x: 1.0, z: 2.5 }, { x: 1.0, z: 5.5 }]); // onto the channel
    expect(sim.state.child.wet).toBe("wet");
    sim.walk([{ x: 1.0, z: 7.2 }]);
    sim.press("interact");
    expect(sim.state.child.wet).toBe("dry");
  });

  it("in the channel: held towel + Q is F1; towel on the head + Q only explains", () => {
    const head = new Sim();
    head.switchTo("adult");
    head.walk([{ x: 3.4, z: 2.4 }, { x: 1.0, z: 2.5 }, { x: 1.0, z: 5.5 }]);
    head.press("interact"); // towel to the head
    expect(head.state.adult.towel).toBe("head");
    head.press("dipTowel");
    head.expectPlaying();
    expect(head.lastEvents).toContainEqual({ kind: "prompt", text: MSG.towelOnHead });

    const held = new Sim();
    held.switchTo("adult");
    held.walk([{ x: 3.4, z: 2.4 }, { x: 1.0, z: 2.5 }, { x: 1.0, z: 5.5 }]);
    expect(held.state.adult.towel).toBe("held");
    held.press("dipTowel");
    expect(held.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
  });
});
