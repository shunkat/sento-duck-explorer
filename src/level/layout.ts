// Level data, in meters on the XZ plane (x → right, z → down on the map).
// Realistic sento layout (2026-11-20, provisional): genkan/reception/lobby →
// screened changing room → bath hall (drying mat, kakeyu, washing stations,
// rear tub, trough joined to it, kids' corner with a milk bottle (2026-11-23),
// cold plunge) → compact sauna; open-air bath and
// terrace → garden → pond with a low edge. Diagram and dimensions:
// .kiro/specs/prototype-core-gameplay/design.md "Realistic sento layout".

import type { CharacterId, HighDoorId, MilkId, NodeId, Vec2, ZoneId } from "../core/types";
import { type AABB, box } from "../sim/geometry";

export const WALL_T = 0.2;

/** Collision radius per character. PassWidth = 2 × radius. */
export const CHARACTER_RADIUS: Record<CharacterId, number> = {
  duck: 0.15,
  child: 0.25,
  adult: 0.35,
};

export const passWidthOf = (id: CharacterId): number => 2 * CHARACTER_RADIUS[id];

/** Clear opening widths (meters). */
export const NARROW_HOLE_WIDTH = 0.4;
export const CROWD_GAP_WIDTH = 0.6;
export const DOOR_WIDTH = 1.2;

export interface Zone {
  id: ZoneId;
  box: AABB;
}

export interface Door {
  id: string;
  a: ZoneId;
  b: ZoneId;
  /** The opening itself, used for rendering and prompts. */
  box: AABB;
}

/**
 * A door with a handle only the Adult can reach (2026-11-21, provisional).
 * `blocker` collides while the door is closed; `handle` is where E is pressed
 * (within `REACH.handle`) and where the handle is drawn, `handleY` its height.
 */
export interface HighDoor {
  blocker: AABB;
  handle: Vec2;
  handleY: number;
  label: string;
}

export interface CrowdGap {
  /** Clear opening between NPC boxes. */
  box: AABB;
  width: number;
}

/** Fixed furniture and boundaries that block movement (they are also in `Level.walls`). */
export type FixtureKind =
  | "screen" | "locker" | "shoeLocker" | "bench" | "desk" | "shelf" | "stool" | "basin" | "plunge"
  | "outdoorBath" | "heater" | "holeSide" | "hedge" | "fence" | "pondEdge" | "rock" | "shrub" | "step" | "staff"
  // Growth route (2026-11-21): provisional shapes drawn over the authored environment.
  | "partition" | "storage" | "curb";

/** Growth-route additions the 3f57ed2 environment export does not contain (drawn by the game until re-export). */
export const GROWTH_FIXTURE_KINDS: ReadonlySet<FixtureKind> = new Set(["partition", "storage", "curb"]);
export const GROWTH_DECOR_KINDS: ReadonlySet<DecorKind> = new Set(["poolEdge", "threshold"]);
/** The street stub (x ≥ 10.9 on the genkan side) is new as well: its fences are growth additions. */
export const isStreetFixture = (f: { kind: FixtureKind; box: AABB }): boolean => f.kind === "fence" && f.box.minX >= 10.9 && f.box.maxZ <= -4.8;

export interface Fixture {
  kind: FixtureKind;
  box: AABB;
  /** Drawn height (m). The camera ignores a fixture whose top is below the eye. */
  height: number;
  label?: string;
}

/** Non-blocking details: flush on the floor (mats, borders) or on a wall face (mirrors, taps). */
export type DecorKind =
  | "mat" | "border" | "mirror" | "tap" | "bucket" | "shelf" | "shower" | "curtain" | "deck" | "stone"
  | "norenMen" | "norenWomen"
  // Growth route (2026-11-21/22): kids' pool edge and the street-door threshold.
  | "poolEdge" | "threshold";

export interface Decor {
  kind: DecorKind;
  box: AABB;
  y0: number;
  height: number;
  label?: string;
}

export interface Level {
  /** Ordered from most specific to least specific. */
  zones: readonly Zone[];
  /** Everything that blocks movement: full-height walls plus every fixture box. */
  walls: readonly AABB[];
  /** Solid furniture and low boundaries, with their drawn heights (subset of `walls`). */
  fixtures: readonly Fixture[];
  /** Drawn-only details that never block. */
  decor: readonly Decor[];
  /** Sauna crowd NPC bodies. They collide like walls. */
  npcs: readonly AABB[];
  crowdGaps: readonly CrowdGap[];
  narrowHole: { box: AABB; width: number };
  doors: readonly Door[];
  nodes: Record<NodeId, Vec2>;
  locker: Vec2;
  soaps: readonly { pos: Vec2; radius: number }[];
  /** Where the Duck starts (in the tub). */
  start: Vec2;
  /**
   * Water surfaces where Duck can swim: the tub, the trough joined to it, the
   * kids' pool with milk2, and the NarrowHole. Duck's center must stay inside
   * their union. Splash (wet floor) is not swimmable. One source for movement,
   * wetting, F1 and rendering.
   */
  duckWater: readonly AABB[];
  /**
   * The 女湯 entrance on the lobby wall (2026-11-20, provisional; F8). Only the
   * entrance exists. `doorway` is the wall opening, `step` the solid raised
   * threshold filling the shallow vestibule, `inward` the unit direction into it.
   */
  womensEntrance: { doorway: AABB; step: AABB; inward: Vec2 };
  /** Named floor points (provisional) for scripted routes and guidance. */
  waypoints: Readonly<typeof WAYPOINTS>;
  /** Safe spot per bottle where the grown player is placed when it does not fit where it stood (and on checkpoint restore). */
  growthSpots: Record<MilkId, Vec2>;
  /** Checked floor path around the kids partition to its gate, across the bath and into the sauna. */
  guardianPath: readonly Vec2[];
  highDoors: Record<HighDoorId, HighDoor>;
}

const T = WALL_T;
const H = WALL_T / 2;
/** Height of the NarrowHole alcove sides (a lid covers them). */
export const HOLE_SIDE_HEIGHT = 0.55;
/** Outdoor board fence around the open-air bath and garden. */
const FENCE_HEIGHT = 2.0;
/** Boundary lines built with vWall/hWall but drawn low (already added to the walls list). */
const LOW_LINE_KINDS: ReadonlySet<FixtureKind> = new Set(["fence", "hedge", "pondEdge"]);

/** Vertical wall line at `x` from z0 to z1, with clear openings [g0, g1]. */
function vWall(x: number, z0: number, z1: number, gaps: [number, number][] = []): AABB[] {
  return segments(z0, z1, gaps).map(([a, b]) => box(x - H, a, x + H, b));
}

/** Horizontal wall line at `z` from x0 to x1, with clear openings [g0, g1]. */
function hWall(z: number, x0: number, x1: number, gaps: [number, number][] = []): AABB[] {
  return segments(x0, x1, gaps).map(([a, b]) => box(a, z - H, b, z + H));
}

function segments(from: number, to: number, gaps: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  let cur = from;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > cur) out.push([cur, g0]);
    cur = g1;
  }
  if (to > cur) out.push([cur, to]);
  return out;
}

// ---------------------------------------------------------------------------
// Realistic sento layout (2026-11-20, provisional; see
// .kiro/specs/prototype-core-gameplay/design.md "Realistic sento layout").
// Every number here is an original provisional design, not a real building.
// ---------------------------------------------------------------------------

// Door openings (clear width DOOR_WIDTH).
const LOBBY_DOOR: [number, number] = [-7.6, -7.6 + DOOR_WIDTH]; // on x=4 (reception ↔ lobby) and x=8 (reception ↔ genkan)
// Counter window on x=4 north of the lobby door: reception looks over a low counter into the lobby (review R-1).
const COUNTER_WINDOW: [number, number] = [-8.8, -7.8];
const RECEPTION_DOOR: [number, number] = [6.2, 6.2 + DOOR_WIDTH]; // on z=-5, east end of the changing room
const BATH_DOOR: [number, number] = [0.8, 0.8 + DOOR_WIDTH]; // on z=0, west end: offset from the reception door
const SAUNA_DOOR: [number, number] = [1.2, 1.2 + DOOR_WIDTH]; // on x=12
const OPEN_AIR_DOOR: [number, number] = [6.6, 6.6 + DOOR_WIDTH]; // on x=12
const GARDEN_GATE: [number, number] = [7.4, 7.4 + DOOR_WIDTH]; // in the hedge on x=20
const WOMENS_DOOR: [number, number] = [-7.6, -7.6 + DOOR_WIDTH]; // 女湯 entrance on the lobby wall x=0

// 女湯 entrance: a shallow opaque vestibule west of x=0 whose floor is a raised step.
// The step's face sits 0.15 m into the lobby so it reads as a threshold.
const WOMENS_VESTIBULE_X0 = -1.0;
const WOMENS_STEP = box(WOMENS_VESTIBULE_X0, WOMENS_DOOR[0], 0.15, WOMENS_DOOR[1]);
const WOMENS_STEP_HEIGHT = 0.25;

// NarrowHole: a low alcove going west (−x) out of the bath wall at x=0, at the rear wall.
const NH_Z0 = 8.3;
const NH_Z1 = NH_Z0 + NARROW_HOLE_WIDTH;
const NH_END_X = -3;

/** Main tub water, against the rear wall (z=9) with an aisle to the east. */
const BATHWATER_BOX = box(4.6, 5.4, 10.6, 8.8);
/**
 * Trough: shallow water along the rear wall. Since 2026-11-21 it is joined to
 * the tub (it used to end 0.8 m short), so Duck swims to the kids' pool alone.
 */
const TROUGH_BOX = box(-0.1, NH_Z0, 4.7, NH_Z1);

// Kids' corner (2026-11-21, provisional; design "Growth and exit"): pool with
// milk2 → child passage (0.60 m) → meeting room → adult-assisted gate (1.0 m).
const KIDS_X1 = 2.3; // inner east face (partition x 2.3–2.5)
const KIDS_POOL = box(0.3, 7.3, 2.1, NH_Z1);
const KIDS_GATE: [number, number] = [0.6, 1.6]; // in the room's north partition (z 2.8–3.0)
// Street door (review R-1, 2026-11-22): the real way out is the genkan's street
// door on x=11. The high-handle door sits there; reception ↔ genkan (x=8) is an
// ordinary open doorway. Outside is a short street stub (x 11–13).
const STREET_DOOR: [number, number] = [-7.6, -7.6 + DOOR_WIDTH]; // on x=11
const STREET_X1 = 13;
const FRONT_EXIT_BLOCKER = box(11 - H, STREET_DOOR[0], 11 + H, STREET_DOOR[1]);

// Sauna: compact seated room. Each seated row is a line of bathers with one clear gap.
const SAUNA_X1 = 18.9; // 0.5 m longer than first drafted: 1.0 m in front of the hat shelf (review M-1)
const SAUNA_IN_Z0 = 0 + H;
const SAUNA_IN_Z1 = 4 - H;
const CROWD_ROWS: { x0: number; x1: number; gapZ0: number }[] = [
  { x0: 14.0, x1: 14.6, gapZ0: 1.6 },
  { x0: 15.4, x1: 16.0, gapZ0: 0.5 },
  { x0: 16.8, x1: 17.4, gapZ0: 2.6 },
];

const npcs: AABB[] = [];
const crowdGaps: CrowdGap[] = [];
for (const row of CROWD_ROWS) {
  const gapZ1 = row.gapZ0 + CROWD_GAP_WIDTH;
  npcs.push(box(row.x0, SAUNA_IN_Z0, row.x1, row.gapZ0));
  npcs.push(box(row.x0, gapZ1, row.x1, SAUNA_IN_Z1));
  crowdGaps.push({ box: box(row.x0, row.gapZ0, row.x1, gapZ1), width: CROWD_GAP_WIDTH });
}

const fixtures: Fixture[] = [];
const fix = (kind: FixtureKind, b: AABB, height: number, label?: string): AABB => {
  fixtures.push({ kind, box: b, height, label });
  return b;
};
const decor: Decor[] = [];
const deco = (kind: DecorKind, b: AABB, y0: number, height: number, label?: string) => decor.push({ kind, box: b, y0, height, label });

/** Low boundary lines (hedge, fence, pond edge) built like walls but drawn at their own height. */
const lowV = (kind: FixtureKind, x: number, z0: number, z1: number, h: number, gaps: [number, number][] = []) =>
  vWall(x, z0, z1, gaps).map((b) => fix(kind, b, h));
const lowH = (kind: FixtureKind, z: number, x0: number, x1: number, h: number) => hWall(z, x0, x1).map((b) => fix(kind, b, h));

// Lobby, reception, genkan (z -9..-5).
fix("shoeLocker", box(8.3, -8.9, 10.7, -8.4), 1.2, "下足箱");
// The desk stands 0.6 m off the north wall and reaches the east wall, so the receptionist behind it is enclosed.
fix("desk", box(4.4, -8.3, 8 - H, -7.8), 0.9, "受付台");
fix("staff", box(4.6, -8.85, 5.2, -8.4), 1.6, "受付の人"); // at the counter window, facing the lobby
// Low counter filling the window: the view stays open, no body can pass.
fix("desk", box(4 - H, COUNTER_WINDOW[0], 4 + H, COUNTER_WINDOW[1]), 0.9);
fix("bench", box(0.3, -8.8, 2.5, -8.4), 0.45, "休憩所のベンチ");
fix("step", WOMENS_STEP, WOMENS_STEP_HEIGHT, "段差");
deco("norenWomen", box(-0.05, WOMENS_DOOR[0], 0.05, WOMENS_DOOR[1]), 1.5, 0.5, "女湯"); // short noren above head height (non-blocking)
deco("norenMen", box(RECEPTION_DOOR[0], -5 - H - 0.06, RECEPTION_DOOR[1], -5 - H), 1.5, 0.5, "男湯");
deco("curtain", box(10.8, STREET_DOOR[0], 10.9, STREET_DOOR[1]), 1.5, 0.5, "入口ののれん"); // above head height
// Street side: a flush stone threshold under the street door and a low fence round the stub.
deco("threshold", box(11 - H, STREET_DOOR[0], 11.6, STREET_DOOR[1]), 0, 0.04, "敷居（ここから外）");

// Changing room (z -5..0).
// Privacy screen: a full-height partition west of the reception door makes an entry vestibule
// (x 5.7–7.9); the way in is round its south end, so reception cannot see the lockers or the bath door.
fix("screen", box(5.5, -5 + H, 5.7, -1.2), 2.2, "目隠しの衝立");
fix("locker", box(H, -4.6, 0.7, -1.4), 1.8, "ロッカー（E）");
fix("bench", box(3.0, -2.2, 5.0, -1.8), 0.45);
deco("mirror", box(2.0, -5 + H, 3.6, -4.86), 0.8, 0.9);

// Bath hall (x 0..12, z 0..9).
deco("mat", box(0.2, 0.15, 2.6, 1.4), 0, 0.012, "体を拭く場所（E）");
fix("basin", box(2.9, H, 3.9, 0.6), 0.65, "かけ湯");
for (const z of [1.9, 2.7]) deco("shower", box(H, z - 0.1, 0.2, z + 0.1), 1.6, 0.4, z === 1.9 ? "シャワー" : undefined);
deco("shelf", box(4.2, H, 9.8, 0.3), 0.45, 0.05);
const STATIONS = [4.6, 5.8, 7.0, 8.2, 9.4];
STATIONS.forEach((x, i) => {
  fix("stool", box(x - 0.18, 0.55, x + 0.18, 0.91), 0.3, i === 2 ? "洗い場" : undefined);
  deco("mirror", box(x - 0.3, H, x + 0.3, 0.14), 0.75, 0.55);
  deco("tap", box(x - 0.06, H, x + 0.06, 0.22), 0.5, 0.06);
  deco("bucket", box(x + 0.12, 0.12, x + 0.32, 0.3), 0.5, 0.14);
});
// Flush tile borders (under the water surface): the tub and trough are entered by stepping in.
deco("border", box(BATHWATER_BOX.minX - 0.15, BATHWATER_BOX.minZ - 0.15, BATHWATER_BOX.maxX + 0.15, BATHWATER_BOX.maxZ), 0, 0.01);
deco("border", box(TROUGH_BOX.minX, TROUGH_BOX.minZ - 0.12, TROUGH_BOX.maxX + 0.12, TROUGH_BOX.maxZ + 0.12), 0, 0.01, "アヒルの水路（おもちゃの水遊び場）");
fix("plunge", box(10.4, 2.8, 11.8, 4.2), 0.6, "水風呂（縁があり入れません）");
fix("bench", box(8.6, 3.4, 10.0, 3.8), 0.45, "休憩ベンチ");
deco("shower", box(12 - 0.2, 0.4, 12 - H, 0.6), 1.6, 0.4, "サウナ前のシャワー");

// NarrowHole alcove walls (low; a lid covers the corridor).
fix("holeSide", box(NH_END_X, NH_Z0 - T, -H, NH_Z0), HOLE_SIDE_HEIGHT);
fix("holeSide", box(NH_END_X, NH_Z1, -H, NH_Z1 + T), HOLE_SIDE_HEIGHT);
fix("holeSide", box(NH_END_X - T, NH_Z0 - T, NH_END_X, NH_Z1 + T), HOLE_SIDE_HEIGHT);

// Kids' corner (partition, storage block, curb). The partition stops at the
// trough's north edge and the curb fills the strip south of it, leaving a
// 0.40 m water gap: Duck passes, Child does not.
fix("partition", box(KIDS_X1, 2.8, KIDS_X1 + T, NH_Z0), 1.2, "子ども用のコーナー");
fix("curb", box(KIDS_X1, NH_Z1, KIDS_X1 + T, 9 - H), 0.2);
fix("storage", box(0.7, 4.5, KIDS_X1, 6.7), 1.2, "用具置き場");
fix("partition", box(H, 2.8, KIDS_GATE[0], 3.0), 1.2);
fix("partition", box(KIDS_GATE[1], 2.8, KIDS_X1, 3.0), 1.2);
deco("poolEdge", box(KIDS_POOL.minX - 0.1, KIDS_POOL.minZ - 0.1, KIDS_POOL.maxX + 0.1, KIDS_POOL.minZ), 0, 0.01, "浅い湯だまり");

// Sauna.
fix("heater", box(12.2, 3.0, 13.3, 3.8), 1.0, "ストーブ（近づかない）");
// Shelf kept as scenery (the hat is retired, 2026-11-21); 1.0 m stays clear in front of it.
const HAT_SHELF = box(18.4, 1.5, SAUNA_X1 - H, 2.5);
fix("shelf", HAT_SHELF, 0.9);

// Open air, garden and pond (outdoors).
fix("outdoorBath", box(14.2, 8.6, 18.2, 11.6), 0.55, "露天風呂（岩の縁があり入れません）");
deco("deck", box(12.2, 4.2, 15.6, 6.2), 0, 0.05, "休憩テラス");
fix("bench", box(12.4, 4.3, 14.6, 4.7), 0.45);
fix("shrub", box(20.4, 4.4, 21.2, 5.2), 0.8);
fix("shrub", box(20.4, 10.8, 21.2, 11.6), 0.8);
for (const z of [6.4, 9.6]) deco("stone", box(21.2, z - 0.3, 21.8, z + 0.3), 0, 0.03);
fix("rock", box(27, 4, 28, 9), 1.0);
fix("rock", box(31, 7, 32, 12), 1.0);

const walls: AABB[] = [
  // Lobby / reception / genkan (z -9..-5). The street door on x=11 is the exit (high handle).
  ...hWall(-9, 0, 11),
  ...vWall(0, -9, -5, [WOMENS_DOOR]),
  // 女湯 vestibule: full-height side and back walls (opaque; no interior).
  box(WOMENS_VESTIBULE_X0 - T, WOMENS_DOOR[0] - T, -H, WOMENS_DOOR[0]),
  box(WOMENS_VESTIBULE_X0 - T, WOMENS_DOOR[1], -H, WOMENS_DOOR[1] + T),
  box(WOMENS_VESTIBULE_X0 - T, WOMENS_DOOR[0], WOMENS_VESTIBULE_X0, WOMENS_DOOR[1]),
  ...vWall(4, -9, -5, [COUNTER_WINDOW, LOBBY_DOOR]),
  ...vWall(8, -9, -5, [LOBBY_DOOR]),
  ...vWall(11, -9, -5, [STREET_DOOR]),
  // Street stub outside the street door (low fence, outdoors).
  ...lowH("fence", -9, 11, STREET_X1, FENCE_HEIGHT),
  ...lowH("fence", -5, 11, STREET_X1, FENCE_HEIGHT),
  ...lowV("fence", STREET_X1, -9, -5, FENCE_HEIGHT),
  ...hWall(-5, 0, 11, [RECEPTION_DOOR]),
  // Changing room (z -5..0)
  ...vWall(0, -5, 0),
  ...vWall(8, -5, 0),
  // Bath hall and sauna
  ...hWall(0, 0, SAUNA_X1, [BATH_DOOR]),
  ...vWall(0, 0, 9, [[NH_Z0, NH_Z1]]),
  ...hWall(9, 0, 12),
  ...vWall(12, 0, 12, [SAUNA_DOOR, OPEN_AIR_DOOR]),
  ...vWall(SAUNA_X1, 0, 4),
  ...hWall(4, 12, SAUNA_X1),
  // Outdoors: fences, the garden hedge with its gate, the low pond edges.
  ...lowH("fence", 4, SAUNA_X1, 23, FENCE_HEIGHT),
  ...lowH("fence", 12, 12, 23, FENCE_HEIGHT),
  ...lowV("hedge", 20, 4, 12, 1.0, [GARDEN_GATE]),
  ...lowV("pondEdge", 23, 4, 12, 0.45),
  ...lowH("pondEdge", 4, 23, 36, 0.5),
  ...lowH("pondEdge", 12, 23, 36, 0.5),
  ...lowV("pondEdge", 36, 4, 12, 0.5),
  // Solid fixtures collide like walls (stools, benches, rims, heater, ...).
  ...fixtures.filter((f) => !LOW_LINE_KINDS.has(f.kind)).map((f) => f.box),
];

/** Named floor points (provisional) for scripted routes and guidance. */
const WAYPOINTS = {
  // Duck: tub bottle → trough → pool bottle (either collection order).
  tubMilkSwim: { x: 9.8, z: 5.65 },
  tubWestDeep: { x: 4.9, z: 8.5 },
  troughGap: { x: 2.4, z: 8.5 },
  poolIn: { x: 1.6, z: 8.5 },
  milk1Swim: { x: 1.2, z: 7.55 },
  // Child: pool → passage → room; historical milk2Stand now names the meeting spot.
  passageSouth: { x: 0.4, z: 7.0 },
  passageNorth: { x: 0.4, z: 4.3 },
  milk2Stand: { x: 1.4, z: 3.6 },
  // Child asks the adult across the gate; Adult later uses the drying/exit route.
  gateIn: { x: 1.1, z: 3.5 },
  gateOut: { x: 1.1, z: 2.3 },
  bathDoorDry: { x: 1.6, z: 1.4 },
  changingIn: { x: 1.4, z: -1.0 },
  lockerAisle: { x: 2.4, z: -1.0 },
  screenPassage: { x: 6.2, z: -0.6 },
  receptionDoorIn: { x: 6.8, z: -4.2 },
  receptionIn: { x: 6.8, z: -6.0 },
  genkanIn: { x: 9.0, z: -7.0 },
  frontExitIn: { x: 10.4, z: -7.0 }, // genkan side of the street door, within reach of the handle
  streetIn: { x: 12.0, z: -7.0 },
  // Sauna and open-air bottle route; garden remains optional.
  tubNorth: { x: 7.0, z: 4.8 },
  bathAisle: { x: 4.2, z: 3.0 },
  bathMid: { x: 8.0, z: 2.6 },
  saunaDoorDry: { x: 11.3, z: 1.6 },
  saunaIn: { x: 12.9, z: 1.8 },
  saunaMilkStand: { x: 13.2, z: 1.0 },
  eastAisle: { x: 11.2, z: 4.8 },
  openAirDoorBath: { x: 11.3, z: 7.2 },
  openAirIn: { x: 13.0, z: 7.2 },
  openAirMilkStand: { x: 18.8, z: 10.6 },
  gardenGateOut: { x: 18.6, z: 8.0 },
  gardenIn: { x: 21.6, z: 8.0 },
} satisfies Record<string, Vec2>;

export const LEVEL: Level = {
  zones: [
    { id: "narrow_hole", box: box(NH_END_X, NH_Z0, 0, NH_Z1) },
    { id: "kids_pool", box: box(0, 6.7, KIDS_X1, 9) },
    { id: "kids_passage", box: box(0, 4.5, 0.7, 6.7) },
    { id: "kids_room", box: box(0, 3.0, KIDS_X1, 4.5) },
    { id: "bathwater", box: BATHWATER_BOX },
    { id: "splash", box: box(2.9, 0.6, 3.9, 1.5) },
    { id: "bath", box: box(0, 0, 12, 9) },
    { id: "changing", box: box(0, -5, 8, 0) },
    { id: "reception", box: box(4, -9, 8, -5) },
    { id: "common", box: box(0, -9, 4, -5) },
    { id: "genkan", box: box(8, -9, 11, -5) },
    { id: "street", box: box(11, -9, STREET_X1, -5) },
    { id: "sauna_crowd", box: box(CROWD_ROWS[0]!.x0, 0, SAUNA_X1, 4) },
    { id: "sauna_entry", box: box(12, 0, CROWD_ROWS[0]!.x0, 4) },
    { id: "open_air", box: box(12, 4, 20, 12) },
    { id: "pond_entrance", box: box(20, 4, 23, 12) },
    { id: "pond", box: box(23, 4, 36, 12) },
  ],
  walls,
  fixtures,
  decor,
  npcs,
  crowdGaps,
  narrowHole: { box: box(NH_END_X, NH_Z0, 0, NH_Z1), width: NARROW_HOLE_WIDTH },
  doors: [
    { id: "changing_reception", a: "changing", b: "reception", box: box(RECEPTION_DOOR[0], -5 - H, RECEPTION_DOOR[1], -5 + H) },
    { id: "bath_changing", a: "bath", b: "changing", box: box(BATH_DOOR[0], -H, BATH_DOOR[1], H) },
    { id: "bath_sauna", a: "bath", b: "sauna_entry", box: box(12 - H, SAUNA_DOOR[0], 12 + H, SAUNA_DOOR[1]) },
    { id: "bath_open_air", a: "bath", b: "open_air", box: box(12 - H, OPEN_AIR_DOOR[0], 12 + H, OPEN_AIR_DOOR[1]) },
    { id: "open_air_pond_entrance", a: "open_air", b: "pond_entrance", box: box(20 - H, GARDEN_GATE[0], 20 + H, GARDEN_GATE[1]) },
    { id: "reception_common", a: "reception", b: "common", box: box(4 - H, LOBBY_DOOR[0], 4 + H, LOBBY_DOOR[1]) },
    { id: "reception_genkan", a: "reception", b: "genkan", box: box(8 - H, LOBBY_DOOR[0], 8 + H, LOBBY_DOOR[1]) },
    { id: "genkan_street", a: "genkan", b: "street", box: FRONT_EXIT_BLOCKER },
  ],
  nodes: {
    milk1: { x: 9.8, z: 5.15 }, // north tub edge, reachable while swimming
    milk2: { x: 1.2, z: 7.05 }, // shallow pool edge
    milk3: { x: 13.2, z: 0.8 }, // inside sauna, before the child-only crowd gaps
    milk4: { x: 18.8, z: 10.6 }, // far side of the open-air bath
  },
  locker: { x: 1.2, z: -3.0 },
  // Beside washing station 3, off the aisle: running between the stools is F3, walking is safe.
  soaps: [{ pos: { x: 7.6, z: 0.75 }, radius: 0.15 }],
  start: { x: 6.0, z: 6.8 },
  duckWater: [
    BATHWATER_BOX,
    TROUGH_BOX, // joined to the tub and to the hole (0.40 m wide)
    KIDS_POOL, // milk2 at its north edge
    box(NH_END_X, NH_Z0, 0, NH_Z1),
  ],
  womensEntrance: { doorway: box(-H, WOMENS_DOOR[0], H, WOMENS_DOOR[1]), step: WOMENS_STEP, inward: { x: -1, z: 0 } },
  growthSpots: {
    milk1: { x: 9.8, z: 5.7 }, // water, clear for Duck or Child
    milk2: { x: 1.2, z: 7.7 }, // pool, clear for Duck or Child
    milk3: { x: 13.2, z: 1.0 }, // sauna entry fits Adult in either bottle order
    milk4: { x: 18.8, z: 10.6 }, // open-air floor clear for Adult
  },
  guardianPath: [
    { x: 3.1, z: 7.6 }, // pool: beside the kids' pool, east of the partition
    { x: 3.1, z: 3.9 }, // room: beside the kids' room
    { x: 3.1, z: 2.3 }, // turn north of the kids partition
    { x: 1.1, z: 2.3 }, // gate: adult can speak across and open the high latch
    { x: 3.1, z: 2.3 }, // back to the bath aisle after the request
    { x: 8.0, z: 2.3 }, // clear of stools, bench and water
    { x: 11.5, z: 1.8 }, // wait for Child at the sauna door
    { x: 12.9, z: 1.8 }, // enter together through the actual doorway
    { x: 13.1, z: 1.5 }, // remain in the sauna, outside the crowd
  ],
  highDoors: {
    kidsGate: { blocker: box(KIDS_GATE[0], 2.8, KIDS_GATE[1], 3.0), handle: { x: 1.1, z: 2.9 }, handleY: 1.5, label: "高い掛け金の戸（大人なら開く）" },
    frontExit: { blocker: FRONT_EXIT_BLOCKER, handle: { x: 11 - H, z: -7.0 }, handleY: 1.6, label: "玄関の戸（取っ手が高い）" },
  },
  waypoints: WAYPOINTS,
};

