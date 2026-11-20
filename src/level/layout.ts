// Prototype level data, in meters on the XZ plane (x → right, z → down on the map).
//
//            x: 0        6        12   15
//   z=-8   +---------+--------+-----+
//          |reception| common |exter|
//   z=-4   +---D-----+--------+-----+
//          | changing (lockers)     |
//   z= 0   +---D--------------------+-----------+-----------+----------------+
//          | bath  [bathwater] [splash] [soap] D  open_air  D pond_entrance | pond ~~> goal
//      NH)=| coin pocket at x<0                |            |  (shore)      |
//   z= 8   +---S------------------------------+-----------+----------------+
//          | sauna_entry | gap gap gap | hat |
//   z=12   +-------------+-------------------+
//
// D = door, S = locked sauna door, NH = NarrowHole.

import type { CharacterId, NodeId, Vec2, ZoneId } from "../core/types";
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
  /** Adult and Child cross pair doors together (provisional). */
  pair: boolean;
}

export interface CrowdGap {
  /** Clear opening between NPC boxes. */
  box: AABB;
  width: number;
}

export interface Level {
  /** Ordered from most specific to least specific. */
  zones: readonly Zone[];
  walls: readonly AABB[];
  /** Sauna crowd NPC bodies. They collide like walls. */
  npcs: readonly AABB[];
  crowdGaps: readonly CrowdGap[];
  narrowHole: { box: AABB; width: number };
  /** Blocks the sauna door opening while the door is locked. */
  saunaDoorBlocker: AABB;
  doors: readonly Door[];
  nodes: Record<NodeId, Vec2>;
  locker: Vec2;
  soaps: readonly { pos: Vec2; radius: number }[];
  initialPositions: Record<CharacterId, Vec2>;
  pondSpawn: Vec2;
  /**
   * Water surfaces where Duck can swim on its own outside the pond: the tub,
   * a short channel from the tub to the NarrowHole, and the water in the hole.
   * Duck's center must stay inside their union. Splash (wet floor) is not
   * swimmable. One source for movement, drop points and rendering.
   */
  duckWater: readonly AABB[];
  /** Safe spawn positions used when restoring checkpoints. */
  checkpointSpawns: {
    paidReturned: { child: Vec2; adult: Vec2 };
    hatEquipped: Record<CharacterId, Vec2>;
    duckInPondShore: { child: Vec2; adult: Vec2 };
  };
}

const T = WALL_T;
const H = WALL_T / 2;

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

// Door openings (clear width DOOR_WIDTH).
const RECEPTION_DOOR: [number, number] = [2, 2 + DOOR_WIDTH]; // on z=-4
const CHANGING_DOOR: [number, number] = [2, 2 + DOOR_WIDTH]; // on z=0
const SAUNA_DOOR: [number, number] = [2, 2 + DOOR_WIDTH]; // on z=8
const SIDE_DOOR: [number, number] = [3.4, 3.4 + DOOR_WIDTH]; // on x=6, 12, 16, 24
const COMMON_DOOR: [number, number] = [-6.6, -6.6 + DOOR_WIDTH]; // on x=6 and x=12

// NarrowHole: a corridor going left (−x) out of the bath wall at x=0.
const NH_Z0 = 5.3;
const NH_Z1 = NH_Z0 + NARROW_HOLE_WIDTH;
const NH_END_X = -3;

const BATHWATER_BOX = box(2, 3, 7, 7);

// Sauna crowd rows: each row is a column of NPC bodies with one clear gap.
const SAUNA_IN_Z0 = 8 + H;
const SAUNA_IN_Z1 = 12 - H;
const CROWD_ROWS: { x0: number; x1: number; gapZ0: number }[] = [
  { x0: 7.2, x1: 7.8, gapZ0: 9.7 },
  { x0: 9.2, x1: 9.8, gapZ0: 8.9 },
  { x0: 11.2, x1: 11.8, gapZ0: 10.5 },
];

const npcs: AABB[] = [];
const crowdGaps: CrowdGap[] = [];
for (const row of CROWD_ROWS) {
  const gapZ1 = row.gapZ0 + CROWD_GAP_WIDTH;
  npcs.push(box(row.x0, SAUNA_IN_Z0, row.x1, row.gapZ0));
  npcs.push(box(row.x0, gapZ1, row.x1, SAUNA_IN_Z1));
  crowdGaps.push({ box: box(row.x0, row.gapZ0, row.x1, gapZ1), width: CROWD_GAP_WIDTH });
}

const walls: AABB[] = [
  // Reception / common / exterior block (z -8..-4)
  ...hWall(-8, 0, 15),
  ...vWall(0, -8, -4),
  ...vWall(6, -8, -4, [COMMON_DOOR]),
  ...vWall(12, -8, -4, [COMMON_DOOR]),
  ...vWall(15, -8, -4),
  ...hWall(-4, 0, 15, [RECEPTION_DOOR]),
  // Changing room (z -4..0)
  ...vWall(0, -4, 0),
  ...vWall(12, -4, 0),
  // Bath / open air / shore (z 0..8)
  ...hWall(0, 0, 27, [CHANGING_DOOR]),
  ...hWall(8, 0, 27, [SAUNA_DOOR]),
  ...vWall(0, 0, 8, [[NH_Z0, NH_Z1]]),
  ...vWall(16, 0, 8, [SIDE_DOOR]),
  ...vWall(24, 0, 8, [SIDE_DOOR]),
  // Solid wall between the shore and the pond: humans cannot enter the pond.
  ...vWall(27, 0, 8),
  // NarrowHole corridor sides and end
  box(NH_END_X, NH_Z0 - T, -H, NH_Z0),
  box(NH_END_X, NH_Z1, -H, NH_Z1 + T),
  box(NH_END_X - T, NH_Z0 - T, NH_END_X, NH_Z1 + T),
  // Sauna (z 8..12)
  ...vWall(0, 8, 12),
  ...vWall(14, 8, 12),
  ...hWall(12, 0, 14),
  // Pond (x 27..40, z 0..8)
  ...hWall(0, 27, 40),
  ...hWall(8, 27, 40),
  ...vWall(40, 0, 8),
  // Pond rocks that force steering
  box(31, 0, 32, 5),
  box(35, 3, 36, 8),
];

export const LEVEL: Level = {
  zones: [
    { id: "narrow_hole", box: box(NH_END_X, NH_Z0, 0, NH_Z1) },
    { id: "bathwater", box: BATHWATER_BOX },
    { id: "splash", box: box(9, 1, 10.2, 2.2) },
    { id: "bath", box: box(0, 0, 16, 8) },
    { id: "changing", box: box(0, -4, 12, 0) },
    { id: "reception", box: box(0, -8, 6, -4) },
    { id: "common", box: box(6, -8, 12, -4) },
    { id: "exterior", box: box(12, -8, 15, -4) },
    { id: "sauna_crowd", box: box(7.2, 8, 14, 12) },
    { id: "sauna_entry", box: box(0, 8, 7.2, 12) },
    { id: "open_air", box: box(16, 0, 24, 8) },
    { id: "pond_entrance", box: box(24, 0, 27, 8) },
    { id: "pond_goal", box: box(38.5, 2.5, 40, 5.5) },
    { id: "pond", box: box(27, 0, 40, 8) },
  ],
  walls,
  npcs,
  crowdGaps,
  narrowHole: { box: box(NH_END_X, NH_Z0, 0, NH_Z1), width: NARROW_HOLE_WIDTH },
  saunaDoorBlocker: box(SAUNA_DOOR[0], 8 - H, SAUNA_DOOR[1], 8 + H),
  doors: [
    { id: "changing_reception", a: "changing", b: "reception", box: box(RECEPTION_DOOR[0], -4 - H, RECEPTION_DOOR[1], -4 + H), pair: true },
    { id: "bath_changing", a: "bath", b: "changing", box: box(CHANGING_DOOR[0], -H, CHANGING_DOOR[1], H), pair: true },
    { id: "bath_sauna", a: "bath", b: "sauna_entry", box: box(SAUNA_DOOR[0], 8 - H, SAUNA_DOOR[1], 8 + H), pair: true },
    { id: "bath_open_air", a: "bath", b: "open_air", box: box(16 - H, SIDE_DOOR[0], 16 + H, SIDE_DOOR[1]), pair: true },
    { id: "open_air_pond_entrance", a: "open_air", b: "pond_entrance", box: box(24 - H, SIDE_DOOR[0], 24 + H, SIDE_DOOR[1]), pair: true },
    { id: "reception_common", a: "reception", b: "common", box: box(6 - H, COMMON_DOOR[0], 6 + H, COMMON_DOOR[1]), pair: false },
    { id: "common_exterior", a: "common", b: "exterior", box: box(12 - H, COMMON_DOOR[0], 12 + H, COMMON_DOOR[1]), pair: false },
  ],
  nodes: {
    narrow_hole_coin: { x: NH_END_X + 0.3, z: (NH_Z0 + NH_Z1) / 2 },
    reception_desk: { x: 3, z: -7 },
    reception_register: { x: 4, z: -7.4 },
    sauna_hat_shelf: { x: 13.4, z: 10 },
  },
  locker: { x: 6, z: -2 },
  soaps: [{ pos: { x: 12, z: 5 }, radius: 0.15 }],
  initialPositions: {
    duck: { x: 4, z: 5 },
    child: { x: 4.6, z: 4.4 },
    adult: { x: 5.4, z: 4.2 },
  },
  pondSpawn: { x: 28, z: 4 },
  duckWater: [
    BATHWATER_BOX,
    // Channel (provisional layout): same width as the hole, overlapping the tub and the hole so the joints are continuous.
    box(-0.1, NH_Z0, 2.2, NH_Z1),
    box(NH_END_X, NH_Z0, 0, NH_Z1),
  ],
  checkpointSpawns: {
    paidReturned: { adult: { x: 2.6, z: 1.6 }, child: { x: 3.6, z: 1.6 } },
    // Duck on the tub water near the right edge; the humans on the floor beside it.
    hatEquipped: { duck: { x: 6.6, z: 6 }, child: { x: 7.6, z: 6.3 }, adult: { x: 8.3, z: 6 } },
    duckInPondShore: { adult: { x: 25.2, z: 3.6 }, child: { x: 25.2, z: 4.6 } },
  },
};

/** Pair doors as zone pairs; each applies in both directions. */
export const PAIR_DOORS: readonly (readonly [ZoneId, ZoneId])[] = LEVEL.doors
  .filter((d) => d.pair)
  .map((d) => [d.a, d.b] as const);
