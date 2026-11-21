// Acceptance checks for the realistic sento layout (2026-11-20, provisional;
// prototype-core-gameplay design "Realistic sento layout"). Geometry only:
// every number comes from LEVEL.
import { describe, expect, it } from "vitest";
import type { Vec2 } from "../src/core/types";
import { createInitialState } from "../src/core/initialState";
import { REACH } from "../src/core/tuning";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { type AABB, circleOverlapsBox } from "../src/sim/geometry";
import { overviewPose } from "../src/view/camera";
import { deriveView } from "../src/view/deriveView";
import { CAMERA_PROFILE, obstaclesFor, shoulderPose, WALL_HEIGHT } from "../src/view/shoulder";
import * as R from "./helpers/route";

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
    expect([door("reception_exterior").a, door("reception_exterior").b]).toEqual(["reception", "exterior"]);
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

  it("the trough is separate from the tub by a dry gap and joined to the hole", () => {
    const [tub, trough, hole] = water;
    expect(tub!.minX - trough!.maxX).toBeGreaterThanOrEqual(0.8 - 1e-9);
    expect(trough!.minX).toBeLessThanOrEqual(hole!.maxX);
    expect(trough!.maxZ - trough!.minZ).toBeCloseTo(hole!.maxZ - hole!.minZ, 9);
    // At the rear wall: the trough is inside the bath, next to the wall.
    expect(trough!.maxZ).toBeLessThan(zone("bath").maxZ);
    expect(zone("bath").maxZ - trough!.maxZ).toBeLessThan(0.5);
    // The tub rests against the rear wall too, with an aisle to the east.
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

  it("from the paidReturned spawns to the sauna drying spot along the aisle crosses no water", () => {
    for (const p of Object.values(LEVEL.checkpointSpawns.paidReturned)) {
      expect(crossesWet([p, W.bathAisle, W.bathMid, W.saunaDoorDry], CHARACTER_RADIUS.adult)).toBe(false);
    }
  });

  it("every human spawn and waypoint used on foot is clear of fixtures, water and the splash", () => {
    const human = [
      ...Object.values(LEVEL.checkpointSpawns.paidReturned),
      LEVEL.checkpointSpawns.hatEquipped.child,
      LEVEL.checkpointSpawns.hatEquipped.adult,
      ...Object.values(LEVEL.checkpointSpawns.duckInPondShore),
    ];
    for (const p of human) {
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
    const obs = obstaclesFor(LEVEL, "unlocked");
    // Adult in the garden facing the pond (+X): the eye behind it may pass back over the hedge.
    const a = shoulderPose("adult", { x: W.gardenIn.x - 0.4, y: 0.85, z: W.gardenIn.z + 1.6 }, Math.PI / 2, obs);
    expect(a.eye.x).toBeLessThan(20); // over the hedge on x = 20
    // Duck just inside the pond facing the goal: the eye stays on the pond side of the low edge.
    const pond = zone("pond");
    const d = shoulderPose("duck", { x: LEVEL.pondSpawn.x, y: 0.1, z: LEVEL.pondSpawn.z }, Math.PI / 2, obs);
    expect(d.eye.x).toBeGreaterThan(pond.minX);
    expect(CAMERA_PROFILE.duck.eye).toBeLessThan(0.5);
  });

  it("the overview is centred on the level and high enough to show all of it", () => {
    const o = overviewPose(LEVEL);
    const xs = LEVEL.zones.flatMap((z) => [z.box.minX, z.box.maxX]);
    expect(o.target.x).toBeCloseTo((Math.min(...xs) + Math.max(...xs)) / 2, 9);
    expect(o.eye.y).toBeGreaterThan(20);
  });

  it("the pond route still clears with the moved pond (rocks keep forcing a detour)", () => {
    const rocks = LEVEL.fixtures.filter((f) => f.kind === "rock");
    expect(rocks).toHaveLength(2);
    for (const r of rocks) expect(R.POND_PATH.some((p) => circleOverlapsBox(p, 0.15, r.box))).toBe(false);
  });
});

describe("realistic layout: sauna hat shelf (review M-1, L-4)", () => {
  const shelf = LEVEL.fixtures.find((f) => f.kind === "shelf")!;
  const hat = LEVEL.nodes.sauna_hat_shelf;
  const lastRowX1 = Math.max(...LEVEL.npcs.map((n) => n.maxX));

  it("leaves at least 0.9 m in front of the shelf, while the row gaps stay Child-only", () => {
    expect(shelf.box.minX - lastRowX1).toBeGreaterThanOrEqual(0.9);
    for (const g of LEVEL.crowdGaps) {
      expect(g.width).toBe(0.6);
      expect(2 * CHARACTER_RADIUS.child).toBeLessThan(g.width);
      expect(2 * CHARACTER_RADIUS.adult).toBeGreaterThan(g.width);
    }
  });

  it("Child can stand anywhere in a strip at least 0.3 m deep and reach the hat", () => {
    const r = CHARACTER_RADIUS.child;
    const clear = (p: Vec2) => !LEVEL.walls.some((w) => circleOverlapsBox(p, r - 1e-3, w)) && !LEVEL.npcs.some((n) => circleOverlapsBox(p, r - 1e-3, n));
    const reachable = (x: number) => clear({ x, z: hat.z }) && Math.abs(x - hat.x) <= REACH.hat;
    const xs: number[] = [];
    for (let x = lastRowX1; x <= shelf.box.minX; x += 0.01) if (reachable(x)) xs.push(x);
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThanOrEqual(0.3);
  });

  it("the resting hat is drawn on top of the shelf; the key on top of the desk", () => {
    const v = deriveView(createInitialState(LEVEL), LEVEL);
    expect(v.items.hat.pos.y).toBeCloseTo(shelf.height + 0.05);
    expect(v.items.key.pos.y).toBeCloseTo(LEVEL.fixtures.find((f) => f.kind === "desk")!.height + 0.05);
  });
});
