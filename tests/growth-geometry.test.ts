// Growth route geometry (Requirement 11.4): Duck reaches milk1 on connected
// water only; each growth place fits the new body and has an exit wide enough
// for it, and no stage can skip ahead. Flood fills on a 5 cm grid with the
// real collision boxes.
import { describe, expect, it } from "vitest";
import { REACH } from "../src/core/tuning";
import type { CoreState, Vec2, ZoneId } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL, passWidthOf } from "../src/level/layout";
import { circleOverlapsBox, distance } from "../src/sim/geometry";
import { shoreBoxes, wallsFor } from "../src/sim/movement";
import { zoneAt } from "../src/sim/zones";

const STEP = 0.05;
const BOUNDS = { minX: -1, maxX: 24, minZ: -9.2, maxZ: 12.2 };

/** Cells reachable from `start` for a body of radius r (4-connected), as "i,j" keys with their points. */
function flood(start: Vec2, free: (p: Vec2) => boolean): Map<string, Vec2> {
  const key = (i: number, j: number) => `${i},${j}`;
  const pt = (i: number, j: number) => ({ x: BOUNDS.minX + i * STEP, z: BOUNDS.minZ + j * STEP });
  const i0 = Math.round((start.x - BOUNDS.minX) / STEP);
  const j0 = Math.round((start.z - BOUNDS.minZ) / STEP);
  const seen = new Map<string, Vec2>();
  const queue: [number, number][] = [[i0, j0]];
  if (!free(pt(i0, j0))) return seen;
  seen.set(key(i0, j0), pt(i0, j0));
  while (queue.length) {
    const [i, j] = queue.pop()!;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const ni = i + di;
      const nj = j + dj;
      const k = key(ni, nj);
      if (seen.has(k)) continue;
      const p = pt(ni, nj);
      if (p.x < BOUNDS.minX || p.x > BOUNDS.maxX || p.z < BOUNDS.minZ || p.z > BOUNDS.maxZ || !free(p)) continue;
      seen.set(k, p);
      queue.push([ni, nj]);
    }
  }
  return seen;
}

const doors = (kidsGate: "open" | "closed", frontExit: "open" | "closed"): CoreState["doors"] => ({ kidsGate, frontExit });
const walker = (r: number, d: CoreState["doors"]) => {
  const walls = wallsFor(LEVEL, d);
  return (p: Vec2) => !walls.some((w) => circleOverlapsBox(p, r, w));
};
const zonesOf = (cells: Map<string, Vec2>) => new Set([...cells.values()].map((p) => zoneAt(LEVEL, p)));
const reaches = (cells: Map<string, Vec2>, target: Vec2, d: number) => [...cells.values()].some((p) => distance(p, target) <= d);

describe("clearances", () => {
  it("Duck-only gap 0.40 m, child passage 0.60 m, gate 1.0 m: each fits only the intended stages", () => {
    const gapZ0 = LEVEL.fixtures.find((f) => f.kind === "partition" && f.box.maxZ === 8.3)!.box.maxZ;
    const curb = LEVEL.fixtures.find((f) => f.kind === "curb")!.box;
    const gap = curb.minZ - gapZ0;
    const storage = LEVEL.fixtures.find((f) => f.kind === "storage")!.box;
    const passage = storage.minX - 0.1; // bath wall face at x 0.1
    const gate = LEVEL.highDoors.kidsGate.blocker;
    const gateW = gate.maxX - gate.minX;
    expect(gap).toBeCloseTo(0.4);
    expect(passage).toBeCloseTo(0.6);
    expect(gateW).toBeCloseTo(1.0);
    expect(passWidthOf("duck")).toBeLessThan(gap);
    expect(passWidthOf("child")).toBeGreaterThan(gap);
    expect(passWidthOf("child")).toBeLessThan(passage);
    expect(passWidthOf("adult")).toBeGreaterThan(passage);
    expect(passWidthOf("adult")).toBeLessThan(gateW);
  });
});

describe("Duck: connected water only", () => {
  const water = LEVEL.duckWater;
  const shore = shoreBoxes(water);
  const r = CHARACTER_RADIUS.duck;
  const swim = (p: Vec2) =>
    water.some((w) => p.x >= w.minX && p.x <= w.maxX && p.z >= w.minZ && p.z <= w.maxZ) &&
    ![...LEVEL.walls, ...shore].some((b) => circleOverlapsBox(p, r - 1e-3, b));
  const cells = flood(LEVEL.start, swim);

  it("from the tub Duck reaches a spot within reach of milk1, swimming only", () => {
    expect(reaches(cells, LEVEL.nodes.milk1, REACH.milk)).toBe(true);
    expect(zonesOf(cells)).toEqual(new Set<ZoneId | null>(["bathwater", "bath", "kids_pool", "narrow_hole"]));
  });

  it("Duck never reaches milk2", () => {
    expect(reaches(cells, LEVEL.nodes.milk2, REACH.milk + 0.5)).toBe(false);
  });
});

describe("Child: kept in the kids' corner until it grows", () => {
  const cells = flood(LEVEL.growthSpots.milk1, walker(CHARACTER_RADIUS.child, doors("closed", "closed")));

  it("fits the landing, walks the passage and reaches milk2", () => {
    expect(cells.size).toBeGreaterThan(100);
    expect(reaches(cells, LEVEL.nodes.milk2, REACH.milk)).toBe(true);
  });

  it("cannot leave: only the pool, the passage and the room (no way along the trough, through the hole or the gate)", () => {
    expect(zonesOf(cells)).toEqual(new Set<ZoneId | null>(["kids_pool", "kids_passage", "kids_room"]));
  });
});

describe("Adult: room fits, passage does not, the gate is the exit", () => {
  it("with the gate closed the Adult stays in the room (the passage is too narrow)", () => {
    const cells = flood(LEVEL.growthSpots.milk2, walker(CHARACTER_RADIUS.adult, doors("closed", "closed")));
    expect(cells.size).toBeGreaterThan(100);
    expect(zonesOf(cells)).toEqual(new Set<ZoneId | null>(["kids_room"]));
    expect(reaches(cells, LEVEL.highDoors.kidsGate.handle, REACH.handle)).toBe(true);
  });

  it("with the gate open the Adult reaches the drying mat, the locker, reception, the genkan and the street-door handle, not the street", () => {
    const cells = flood(LEVEL.growthSpots.milk2, walker(CHARACTER_RADIUS.adult, doors("open", "closed")));
    const z = zonesOf(cells);
    for (const id of ["bath", "changing", "reception", "common", "genkan"] as const) expect(z.has(id), id).toBe(true);
    expect(z.has("street")).toBe(false);
    expect(z.has("kids_passage")).toBe(false);
    expect(reaches(cells, LEVEL.locker, REACH.locker)).toBe(true);
    expect(reaches(cells, LEVEL.highDoors.frontExit.handle, REACH.handle)).toBe(true);
  });

  it("with both doors open the Adult reaches the street", () => {
    const cells = flood(LEVEL.growthSpots.milk2, walker(CHARACTER_RADIUS.adult, doors("open", "open")));
    expect(zonesOf(cells).has("street")).toBe(true);
  });
});
