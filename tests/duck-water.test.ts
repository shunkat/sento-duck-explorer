// Duck on water (review R-2): shore stops, gliding, joints, off-water starts,
// the 0.40 m gap and no jump between surfaces, against the one-player state.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT, type Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { shoreBoxes, stepDuckWater, stepWalk, wallsFor } from "../src/sim/movement";

const water = LEVEL.duckWater;
const shore = shoreBoxes(water);
const walls = wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
const r = CHARACTER_RADIUS.duck;
const [tub, trough, pool] = water;
const onWater = (p: Vec2) => water.some((w) => p.x >= w.minX && p.x <= w.maxX && p.z >= w.minZ && p.z <= w.maxZ);
const swim = (p: Vec2, move: Vec2, n: number) => {
  for (let i = 0; i < n; i++) {
    const q = stepDuckWater(p, move, walls, water);
    expect(Math.hypot(q.x - p.x, q.z - p.z)).toBeLessThanOrEqual(1.5 / 60 + 1e-9); // no jump
    expect(onWater(q)).toBe(true);
    expect(shore.some((b) => circleOverlapsBox(q, r - 2e-3, b))).toBe(false);
    p = q;
  }
  return p;
};

describe("Duck on water", () => {
  const mid = { x: (tub!.minX + tub!.maxX) / 2, z: (tub!.minZ + tub!.maxZ) / 2 };

  it("stops at the tub shore in four directions and on diagonals", () => {
    for (const d of [{ x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: -1 }, { x: 0.7, z: -0.7 }, { x: 0.7, z: 0.7 }]) {
      const p = swim(mid, d, 400);
      const len = Math.hypot(d.x, d.z);
      const q = stepDuckWater(p, { x: d.x / len, z: d.z / len }, walls, water);
      expect(Math.hypot(q.x - p.x, q.z - p.z), JSON.stringify(d)).toBeLessThan(0.01);
    }
  });

  it("glides along an edge when pushed into it at an angle", () => {
    const atNorth = swim(mid, { x: 0, z: -1 }, 400);
    const after = swim(atNorth, { x: 0.6, z: -0.8 }, 30);
    expect(after.x - atNorth.x).toBeGreaterThan(0.2);
    expect(Math.abs(after.z - atNorth.z)).toBeLessThan(0.01);
  });

  it("passes the tub → trough joint and the trough → kids' pool gap (0.40 m) into the pool", () => {
    let p = swim({ x: 5.0, z: 8.5 }, { x: -1, z: 0 }, 60); // tub corner into the trough
    expect(p.x).toBeLessThan(tub!.minX);
    p = swim(p, { x: -1, z: 0 }, 70);
    expect(p.x).toBeLessThan(trough!.maxX);
    p = swim({ x: 2.4, z: 8.5 }, { x: -1, z: 0 }, 40); // through the gap between the partition end and the curb
    expect(p.x).toBeLessThan(pool!.maxX);
    p = swim(p, { x: 0, z: -1 }, 60);
    expect(p.z).toBeLessThan(8.3); // inside the pool, north of the trough
  });

  it("a start off the water does not move (no push-out from the floor)", () => {
    for (const start of [LEVEL.waypoints.bathMid, { x: 3.0, z: 7.6 }, { x: tub!.minX - 0.05, z: 6.0 }]) {
      expect(onWater(start) && !shore.some((b) => circleOverlapsBox(start, r - 1e-3, b))).toBe(false);
      expect(stepDuckWater(start, { x: 1, z: 0 }, walls, water)).toEqual(start);
    }
  });

  it("the 0.40 m gap passes the Duck but not the Child", () => {
    const gapZ = 8.5;
    let child = { x: 3.0, z: gapZ };
    for (let i = 0; i < 120; i++) child = stepWalk("child", child, { x: -1, z: 0 }, false, walls);
    expect(child.x).toBeGreaterThan(2.5); // its center never gets past the partition line (it only noses into the gap)
    const duck = swim({ x: 3.0, z: gapZ }, { x: -1, z: 0 }, 60);
    expect(duck.x).toBeLessThan(2.3);
  });

  it("in the game the Duck never leaves the water on to the floor (tick, held direction)", () => {
    let s = createInitialState(LEVEL);
    for (const d of [{ x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }, { x: 0, z: 1 }]) {
      for (let i = 0; i < 300; i++) {
        s = tick(s, { ...EMPTY_INPUT, move: d }, LEVEL).state;
        expect(onWater(s.player.pos)).toBe(true);
      }
    }
  });
});
