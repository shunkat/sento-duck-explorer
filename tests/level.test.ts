import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { CharacterId, Vec2 } from "../src/core/types";
import {
  CHARACTER_RADIUS,
  CROWD_GAP_WIDTH,
  DOOR_WIDTH,
  LEVEL,
  NARROW_HOLE_WIDTH,
  passWidthOf,
} from "../src/level/layout";
import { moveCircle } from "../src/sim/collision";
import { type AABB, circleOverlapsBox, distance, scale, sub } from "../src/sim/geometry";
import { zoneAt } from "../src/sim/zones";

const SAUNA_WALLS: AABB[] = [...LEVEL.walls, ...LEVEL.npcs];
const BATH_WALLS: AABB[] = [...LEVEL.walls, ...LEVEL.npcs];

/** Walk a circle through waypoints at 4 m/s with 60 Hz steps; returns every position visited. */
function walk(id: CharacterId, start: Vec2, waypoints: Vec2[], walls: AABB[], maxTicks = 2000): Vec2[] {
  const r = CHARACTER_RADIUS[id];
  const step = 4 / 60;
  let p = start;
  const trail = [p];
  let i = 0;
  for (let t = 0; t < maxTicks && i < waypoints.length; t++) {
    const target = waypoints[i]!;
    const d = sub(target, p);
    const len = Math.hypot(d.x, d.z);
    if (len < 0.05) {
      i++;
      continue;
    }
    p = moveCircle(p, scale(d, Math.min(step, len) / len), r, walls);
    trail.push(p);
  }
  return trail;
}

describe("PassWidth comparisons (Req 2.1–2.4, 9.3, 9.4)", () => {
  it("Duck fits the NarrowHole; Child and Adult do not", () => {
    expect(LEVEL.narrowHole.width).toBe(NARROW_HOLE_WIDTH);
    expect(passWidthOf("duck")).toBeLessThan(NARROW_HOLE_WIDTH);
    expect(passWidthOf("child")).toBeGreaterThan(NARROW_HOLE_WIDTH);
    expect(passWidthOf("adult")).toBeGreaterThan(NARROW_HOLE_WIDTH);
  });

  it("Child fits every CrowdGap; Adult fits none", () => {
    expect(LEVEL.crowdGaps).toHaveLength(3);
    for (const g of LEVEL.crowdGaps) {
      expect(g.width).toBe(CROWD_GAP_WIDTH);
      expect(g.box.maxZ - g.box.minZ).toBeCloseTo(CROWD_GAP_WIDTH, 9);
      expect(passWidthOf("child")).toBeLessThan(g.width);
      expect(passWidthOf("adult")).toBeGreaterThan(g.width);
    }
  });

  it("everyone fits through doors", () => {
    for (const id of ["duck", "child", "adult"] as const) {
      expect(passWidthOf(id)).toBeLessThan(DOOR_WIDTH);
    }
  });
});

describe("Collision against narrow openings", () => {
  // The NarrowHole stays as an optional Duck-only alcove (its coin is retired, 2026-11-21).
  const holeTarget = { x: LEVEL.narrowHole.box.minX + 0.3, z: (LEVEL.narrowHole.box.minZ + LEVEL.narrowHole.box.maxZ) / 2 };

  it("Duck walks from the bath into the NarrowHole to its end", () => {
    const trail = walk("duck", { x: 1, z: holeTarget.z }, [holeTarget], BATH_WALLS);
    const end = trail[trail.length - 1]!;
    expect(distance(end, holeTarget)).toBeLessThan(0.1);
    expect(zoneAt(LEVEL, end)).toBe("narrow_hole");
  });

  it("Child and Adult never get their center into the NarrowHole (any approach offset)", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<CharacterId>("child", "adult"),
        fc.double({ min: holeTarget.z - 1.8, max: holeTarget.z + 0.2, noNaN: true }),
        fc.double({ min: -0.4, max: 0.4, noNaN: true }),
        (id, startZ, aimOffset) => {
          const trail = walk(
            id,
            { x: 1.2, z: Math.min(startZ, 8.4) },
            [{ x: holeTarget.x, z: holeTarget.z + aimOffset }],
            BATH_WALLS,
            600,
          );
          return trail.every((p) => zoneAt(LEVEL, p) !== "narrow_hole" && p.x > 0);
        },
      ),
      { numRuns: 100 },
    );
  });

  // Weaving path through the three seated rows' gaps, starting in the sauna entry.
  const saunaPath: Vec2[] = [
    ...LEVEL.crowdGaps.flatMap((g) => {
      const z = (g.box.minZ + g.box.maxZ) / 2;
      return [{ x: g.box.minX - 0.4, z }, { x: (g.box.minX + g.box.maxX) / 2, z }, { x: g.box.maxX + 0.4, z }];
    }),
    { x: 17.9, z: 2.0 }, // in front of the (now empty) shelf
  ];
  const W = LEVEL.waypoints;

  it("a Child body still weaves through all three CrowdGaps to the shelf (geometry; the sauna is optional)", () => {
    const trail = walk("child", W.saunaIn, saunaPath, SAUNA_WALLS);
    const end = trail[trail.length - 1]!;
    expect(distance(end, { x: 17.9, z: 2.0 })).toBeLessThan(0.1);
    expect(zoneAt(LEVEL, end)).toBe("sauna_crowd");
    // Child never overlaps an NPC body (incidental contact is resolved, not tunnelled).
    for (const p of trail) {
      for (const n of LEVEL.npcs) expect(circleOverlapsBox(p, CHARACTER_RADIUS.child - 1e-3, n)).toBe(false);
    }
  });

  it("Adult never gets its center into sauna_crowd (any aim through the first gap)", () => {
    fc.assert(
      fc.property(fc.double({ min: 0.3, max: 3.7, noNaN: true }), (aimZ) => {
        const row = LEVEL.crowdGaps[0]!.box;
        const trail = walk("adult", W.saunaIn, [{ x: row.maxX + 1.5, z: aimZ }], SAUNA_WALLS, 600);
        return trail.every((p) => zoneAt(LEVEL, p) !== "sauna_crowd");
      }),
      { numRuns: 100 },
    );
  });

  it("the sauna door is open: a body walks from the drying spot into the sauna entry", () => {
    const open = walk("adult", W.saunaDoorDry, [W.saunaIn], BATH_WALLS, 300);
    expect(zoneAt(LEVEL, open[open.length - 1]!)).toBe("sauna_entry");
  });

  it("the low pond edge keeps people on the garden side (it is a fixture, not a full wall)", () => {
    const pond = LEVEL.zones.find((z) => z.id === "pond")!.box;
    const trail = walk("adult", W.gardenIn, [{ x: pond.minX + 2, z: W.gardenIn.z }], BATH_WALLS, 300);
    expect(trail.every((p) => zoneAt(LEVEL, p) === "pond_entrance")).toBe(true);
    const edge = LEVEL.fixtures.filter((f) => f.kind === "pondEdge" && f.box.minX < pond.minX && f.box.maxX > pond.minX);
    expect(edge.length).toBeGreaterThan(0);
    for (const f of edge) expect(f.height).toBeLessThan(0.6);
  });
});

describe("Level data sanity", () => {
  const points: [string, Vec2][] = [
    ...Object.entries(LEVEL.nodes),
    ["start", LEVEL.start],
    ["locker", LEVEL.locker],
    ...Object.entries(LEVEL.growthSpots).map(([k, v]) => [`grow.${k}`, v] as [string, Vec2]),
    ...LEVEL.guardianPath.map((v, i) => [`guardian.${i}`, v] as [string, Vec2]),
    ...(["kidsGate", "frontExit"] as const).map((k) => [`handle.${k}`, LEVEL.highDoors[k].handle] as [string, Vec2]),
  ];
  // Handles sit on their door blocker (in the wall line), so only the zone is checked for them.
  const onDoor = (name: string) => name.startsWith("handle.");

  it.each(points)("%s is inside a zone and clear of walls", (name, p) => {
    expect(zoneAt(LEVEL, p)).not.toBeNull();
    if (onDoor(name)) return;
    for (const w of [...LEVEL.walls, ...LEVEL.npcs]) expect(circleOverlapsBox(p, 0.1, w)).toBe(false);
  });

  it("start, bottles and growth spots are in the expected zones", () => {
    expect(zoneAt(LEVEL, LEVEL.start)).toBe("bathwater");
    expect(zoneAt(LEVEL, LEVEL.nodes.milk1)).toBe("kids_pool");
    expect(zoneAt(LEVEL, LEVEL.nodes.milk2)).toBe("kids_room");
    expect(zoneAt(LEVEL, LEVEL.growthSpots.milk1)).toBe("kids_pool");
    expect(zoneAt(LEVEL, LEVEL.growthSpots.milk2)).toBe("kids_room");
  });

  it("the front exit door is the genkan ↔ street opening (the street door, review R-1)", () => {
    const d = LEVEL.doors.find((x) => x.id === "genkan_street")!.box;
    const b = LEVEL.highDoors.frontExit.blocker;
    expect([b.minX, b.maxX, b.minZ, b.maxZ]).toEqual([d.minX, d.maxX, d.minZ, d.maxZ]);
    expect(LEVEL.highDoors.frontExit.handleY).toBeGreaterThan(1.2 + 0.2); // above the Child's height
    expect(LEVEL.highDoors.kidsGate.handleY).toBeGreaterThan(1.2 + 0.2);
  });
});
