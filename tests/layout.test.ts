// Acceptance checks for the realistic sento layout (2026-11-20, provisional;
// prototype-core-gameplay design "Realistic sento layout"). Geometry only:
// every number comes from LEVEL.
import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { type AABB, circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import { overviewPose } from "../src/view/camera";
import { CAMERA_PROFILE, obstaclesFor, shoulderPose, WALL_HEIGHT } from "../src/view/shoulder";

const zone = (id: string) => LEVEL.zones.find((z) => z.id === id)!.box;
const W = LEVEL.waypoints;

/** Grid of points inside a box, `step` apart, `inset` from its edges. */
function grid(b: AABB, step: number, inset = 0.2): Vec2[] {
  const out: Vec2[] = [];
  for (let x = b.minX + inset; x <= b.maxX - inset; x += step) for (let z = b.minZ + inset; z <= b.maxZ - inset; z += step) out.push({ x, z });
  return out;
}

/** True if the segment a→b passes through the inside of box `bx`. */
function segmentHits(a: Vec2, b: Vec2, bx: AABB): boolean {
  const n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.05);
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    if (x > bx.minX && x < bx.maxX && z > bx.minZ && z < bx.maxZ) return true;
  }
  return false;
}

/** Walls and fixtures at least 2 m tall: they block a standing person's view. */
const tallFixtures = new Set(LEVEL.fixtures.filter((f) => f.height >= 2).map((f) => f.box));
const lowFixtures = new Set(LEVEL.fixtures.filter((f) => f.height < 2).map((f) => f.box));
const VIEW_BLOCKERS = LEVEL.walls.filter((w) => tallFixtures.has(w) || !lowFixtures.has(w));

describe("realistic layout: privacy and order of rooms", () => {
  it("rooms follow genkan → reception → changing → bath, with offset doors", () => {
    const door = (id: string) => LEVEL.doors.find((d) => d.id === id)!;
    expect([door("reception_genkan").a, door("reception_genkan").b]).toEqual(["reception", "genkan"]);
    expect([door("genkan_street").a, door("genkan_street").b]).toEqual(["genkan", "street"]);
    expect([door("changing_reception").a, door("changing_reception").b]).toEqual(["changing", "reception"]);
    const rc = door("changing_reception").box;
    const bc = door("bath_changing").box;
    // The changing room's two doors do not line up (no straight walk-through view).
    expect(Math.max(rc.minX, bc.minX)).toBeGreaterThan(Math.min(rc.maxX, bc.maxX));
  });

  it("no straight sightline from reception into the undressing area or the bath", () => {
    const screen = LEVEL.fixtures.find((f) => f.kind === "screen")!;
    expect(screen.height).toBeGreaterThanOrEqual(2);
    const from = [...grid(zone("reception"), 0.5), ...grid(zone("common"), 0.5)]; // the counter window joins them (R-1)
    // The undressing area behind the screen (lockers, benches) and the whole bath.
    const behindScreen = grid(zone("changing"), 0.5).filter((p) => p.x < screen.box.minX - 0.3 && p.z < screen.box.maxZ);
    const to = [...behindScreen, ...grid(zone("bath"), 0.75)];
    expect(behindScreen.some((p) => Math.hypot(p.x - LEVEL.locker.x, p.z - LEVEL.locker.z) < 0.6)).toBe(true);
    for (const a of from) {
      for (const b of to) {
        expect(VIEW_BLOCKERS.some((w) => segmentHits(a, b, w)), `${JSON.stringify(a)} → ${JSON.stringify(b)}`).toBe(true);
      }
    }
  });

  it("only the men's wing is playable; the women's side is an entrance only (F8 tests: womens-entrance.test.ts)", () => {
    expect(LEVEL.zones.filter((z) => z.id === "bath")).toHaveLength(1);
    expect(LEVEL.decor.some((d) => d.kind === "norenWomen" && d.label === "女湯")).toBe(true);
    expect(LEVEL.decor.some((d) => d.kind === "norenMen" && d.label === "男湯")).toBe(true);
  });
});

describe("realistic layout: water, fixtures and collision agree", () => {
  const water = LEVEL.duckWater;
  const isWater = (p: Vec2) => water.some((w) => p.x >= w.minX && p.x <= w.maxX && p.z >= w.minZ && p.z <= w.maxZ);

  it("every fixture blocks movement; decor never does", () => {
    const walls = new Set(LEVEL.walls);
    for (const f of LEVEL.fixtures) expect(walls.has(f.box), f.kind).toBe(true);
    for (const d of LEVEL.decor) expect(walls.has(d.box), d.kind).toBe(false);
  });

  it("decor that stands up (not flush) is on a wall face or out of reach of every body", () => {
    for (const d of LEVEL.decor) {
      if (d.height <= 0.06 || d.y0 >= 1.5) continue; // flush mats/borders/deck, or above head height
      const nearWall = LEVEL.walls.some((w) => !lowFixtures.has(w) && circleOverlapsBox({ x: (d.box.minX + d.box.maxX) / 2, z: (d.box.minZ + d.box.maxZ) / 2 }, 0.25, w));
      expect(nearWall, `${d.kind} at ${JSON.stringify(d.box)}`).toBe(true);
    }
  });

  it("water you can enter has no solid rim; water you cannot enter has a rim and is not swimmable", () => {
    for (const f of LEVEL.fixtures) {
      for (const w of water) {
        const overlap = f.box.minX < w.maxX && f.box.maxX > w.minX && f.box.minZ < w.maxZ && f.box.maxZ > w.minZ;
        // The hole's own side walls touch the hole water only along its edges.
        if (f.kind !== "holeSide") expect(overlap, `${f.kind} over water`).toBe(false);
      }
    }
    for (const kind of ["plunge", "outdoorBath", "basin"] as const) {
      const f = LEVEL.fixtures.find((x) => x.kind === kind)!;
      expect(f.height).toBeGreaterThan(0.4);
      expect(isWater({ x: (f.box.minX + f.box.maxX) / 2, z: (f.box.minZ + f.box.maxZ) / 2 })).toBe(false);
    }
  });

  it("the trough is joined to the tub and to the hole, along the rear wall (growth route, 2026-11-21)", () => {
    const [tub, trough, , hole] = water;
    expect(trough!.maxX).toBeGreaterThan(tub!.minX); // overlaps the tub: Duck swims from the tub into it
    expect(trough!.minZ).toBeGreaterThanOrEqual(tub!.minZ);
    expect(trough!.minX).toBeLessThanOrEqual(hole!.maxX);
    expect(trough!.maxZ - trough!.minZ).toBeCloseTo(hole!.maxZ - hole!.minZ, 9);
    expect(trough!.maxZ).toBeLessThan(zone("bath").maxZ);
    expect(zone("bath").maxZ - trough!.maxZ).toBeLessThan(0.5);
    expect(zone("bath").maxZ - tub!.maxZ).toBeLessThan(0.3);
    expect(zone("bath").maxX - tub!.maxX).toBeGreaterThanOrEqual(2 * CHARACTER_RADIUS.adult + 0.3);
  });

  it("soap lies beside a washing station, off the main aisle", () => {
    const soap = LEVEL.soaps[0]!.pos;
    const stools = LEVEL.fixtures.filter((f) => f.kind === "stool");
    expect(stools.length).toBeGreaterThanOrEqual(4);
    expect(stools.some((s) => Math.abs((s.box.minX + s.box.maxX) / 2 - soap.x) < 0.8 && Math.abs((s.box.minZ + s.box.maxZ) / 2 - soap.z) < 0.4)).toBe(true);
    expect(soap.z).toBeLessThan(W.bathMid.z - 1);
  });
});

describe("realistic layout: dry routes after drying", () => {
  const wetBoxes = [...LEVEL.duckWater, zone("splash")];
  const crossesWet = (path: Vec2[], r: number) =>
    path.some((p, i) => {
      if (i === 0) return false;
      const a = path[i - 1]!;
      const n = Math.ceil(Math.hypot(p.x - a.x, p.z - a.z) / 0.05);
      for (let k = 0; k <= n; k++) {
        const q = { x: a.x + ((p.x - a.x) * k) / n, z: a.z + ((p.z - a.z) * k) / n };
        if (wetBoxes.some((w) => q.x > w.minX && q.x < w.maxX && q.z > w.minZ && q.z < w.maxZ)) return true;
      }
      return false;
    });
  const doorCenter = (id: string) => {
    const b = LEVEL.doors.find((d) => d.id === id)!.box;
    return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
  };

  it("drying spot → its door crosses no water or splash", () => {
    expect(crossesWet([W.bathDoorDry, doorCenter("bath_changing")], CHARACTER_RADIUS.adult)).toBe(false);
    expect(crossesWet([W.saunaDoorDry, doorCenter("bath_sauna")], CHARACTER_RADIUS.adult)).toBe(false);
  });

  it("from the Adult's gate to both drying spots along the aisle crosses no water", () => {
    expect(crossesWet([W.gateOut, W.bathDoorDry], CHARACTER_RADIUS.adult)).toBe(false);
    expect(crossesWet([W.gateOut, { x: 3.0, z: 2.3 }, W.bathMid, W.saunaDoorDry], CHARACTER_RADIUS.adult)).toBe(false);
  });

  it("both Adult growth spots and the dry-route waypoints are clear of fixtures, water and the splash", () => {
    for (const p of [LEVEL.growthSpots.milk3, LEVEL.growthSpots.milk4, W.gateIn, W.gateOut, W.bathDoorDry, W.changingIn, W.receptionIn, W.frontExitIn]) {
      for (const w of LEVEL.walls) expect(circleOverlapsBox(p, CHARACTER_RADIUS.adult, w), JSON.stringify(p)).toBe(false);
      expect(wetBoxes.some((w) => p.x > w.minX && p.x < w.maxX && p.z > w.minZ && p.z < w.maxZ)).toBe(false);
    }
  });
});

describe("realistic layout: pond edge and camera", () => {
  it("the garden is outdoors: hedge and pond edge are low fixtures, the fence is below wall height", () => {
    for (const kind of ["hedge", "pondEdge", "fence", "rock"] as const) {
      for (const f of LEVEL.fixtures.filter((x) => x.kind === kind)) expect(f.height).toBeLessThan(WALL_HEIGHT);
    }
    expect(Math.max(...LEVEL.fixtures.filter((f) => f.kind === "pondEdge").map((f) => f.height))).toBeLessThanOrEqual(0.5);
  });

  it("the Adult's camera looks over the hedge; the Duck's low camera is stopped by the pond edge", () => {
    const obs = obstaclesFor(LEVEL, { kidsGate: "open", frontExit: "open" });
    // Adult in the garden facing the pond (+X): the eye behind it may pass back over the hedge.
    const a = shoulderPose("adult", { x: W.gardenIn.x - 0.4, y: 0.85, z: W.gardenIn.z + 1.6 }, Math.PI / 2, obs);
    expect(a.eye.x).toBeLessThan(20); // over the hedge on x = 20
    // Duck's low camera in the kids' pool facing north stays inside the corner (partition and storage block).
    const d = shoulderPose("duck", { x: W.milk1Swim.x, y: 0.15, z: W.milk1Swim.z }, 0, obs);
    expect(d.eye.z).toBeGreaterThan(6.7);
    expect(CAMERA_PROFILE.duck.eye).toBeLessThan(0.5);
  });

  it("the overview is centred on the level and high enough to show all of it", () => {
    const o = overviewPose(LEVEL);
    const xs = LEVEL.zones.flatMap((z) => [z.box.minX, z.box.maxX]);
    expect(o.target.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 9);
    expect(o.eye.y).toBeGreaterThan(20);
  });

  it("the pond stays as scenery behind its low edge; the rocks are still there", () => {
    expect(LEVEL.fixtures.filter((f) => f.kind === "rock")).toHaveLength(2);
    expect(LEVEL.duckWater.some((w) => w.minX >= zone("pond").minX)).toBe(false); // Duck no longer swims in the pond
  });
});

describe("realistic layout: sauna (optional since 2026-11-21)", () => {
  const shelf = LEVEL.fixtures.find((f) => f.kind === "shelf")!;
  const lastRowX1 = Math.max(...LEVEL.npcs.map((n) => n.maxX));

  it("keeps the seated rows (Child-only gaps) and 0.9 m in front of the (now empty) shelf", () => {
    expect(shelf.box.minX - lastRowX1).toBeGreaterThanOrEqual(0.9);
    for (const g of LEVEL.crowdGaps) {
      expect(g.width).toBe(0.6);
      expect(2 * CHARACTER_RADIUS.child).toBeLessThan(g.width);
      expect(2 * CHARACTER_RADIUS.adult).toBeGreaterThan(g.width);
    }
  });

  it("the sauna door is never locked (no blocker in the collision list)", () => {
    const door = LEVEL.doors.find((d) => d.id === "bath_sauna")!.box;
    const c = { x: (door.minX + door.maxX) / 2, z: (door.minZ + door.maxZ) / 2 };
    expect(wallsFor(LEVEL, { kidsGate: "closed", frontExit: "closed" }).some((w) => circleOverlapsBox(c, 0.3, w))).toBe(false);
  });
});
