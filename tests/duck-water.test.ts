// Duck swims only on water outside the pond; it leaves the bath only in
// Adult's arms (2026-11-20 user correction). Every Sim tick also checks that a
// free Duck's whole body is on the water (tests/helpers/sim.ts duckOnWater).
import { describe, expect, it } from "vitest";
import { duckDropPoint, interactHint } from "../src/core/actions";
import { MSG } from "../src/core/text";
import { REACH } from "../src/core/tuning";
import type { Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { shoreBoxes, stepDuckWater, wallsFor } from "../src/sim/movement";
import { inBathWater } from "../src/sim/zones";
import { BODY_HEIGHT, CARRY_CENTER_Y, deriveView } from "../src/view/deriveView";
import { FacingTracker } from "../src/view/shoulder";
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

  it("the dry gap between the tub and the coin channel stops Duck both ways (no self-movement on the floor)", () => {
    for (const move of [{ x: -1, z: 0 }, { x: -Math.SQRT1_2, z: Math.SQRT1_2 }, { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }]) {
      const fromTub = hold({ x: 3, z: 5.5 }, move, 400);
      for (const p of fromTub) expect(bodyOnLand(p)).toBe(false);
      expect(Math.min(...fromTub.map((p) => p.x))).toBeGreaterThanOrEqual(2 + r - 1e-3);
    }
    const fromChannel = hold({ x: 0.5, z: 5.5 }, { x: 1, z: 0 }, 400);
    for (const p of fromChannel) expect(bodyOnLand(p)).toBe(false);
    expect(Math.max(...fromChannel.map((p) => p.x))).toBeLessThanOrEqual(1.2 - r + 1e-3);
  });

  it("a start point on the floor (or without clearance) does not move: no push-out jump onto the water", () => {
    for (const from of [{ x: 1.99, z: 5.29 }, { x: 1.0, z: 4.0 }, { x: 4.5, z: 2.9 }]) {
      for (const move of [{ x: 1, z: 0 }, { x: 0, z: 1 }, { x: 0, z: -1 }]) {
        expect(stepDuckWater(from, move, walls, LEVEL.duckWater)).toEqual(from);
      }
    }
  });

  it("the channel ↔ hole joint is open both ways, and humans still cannot enter the hole", () => {
    const toHole = hold({ x: 0.9, z: 5.5 }, { x: -1, z: 0 }, 400);
    for (const p of toHole) expect(bodyOnLand(p)).toBe(false);
    expect(toHole.at(-1)!.x).toBeLessThan(-2.5); // channel → hole
    const back = hold(toHole.at(-1)!, { x: 1, z: 0 }, 400);
    expect(back.at(-1)!.x).toBeCloseTo(1.2 - r, 3); // back to the channel's end, not into the tub
    const sim = new Sim();
    sim.switchTo("child");
    for (let i = 0; i < 200; i++) sim.step({ move: { x: -1, z: 0.05 } });
    expect(sim.state.child.zone).not.toBe("narrow_hole");
  });

  it("Duck alone cannot reach the coin: swimming at the channel from the tub never gets it there", () => {
    const sim = new Sim();
    for (const move of [{ x: -1, z: 0.1 }, { x: -1, z: 0 }, { x: -1, z: -0.1 }]) for (let i = 0; i < 400; i++) sim.step({ move });
    expect(sim.state.duck.zone).toBe("bathwater");
    expect(sim.pos("duck").x).toBeGreaterThanOrEqual(2 + r - 1e-3);
    expect(interactHint(sim.state, LEVEL)).toBeNull(); // no coin in reach
    expect(sim.owner("coin")).toBe("node:narrow_hole_coin");
    // Adult cannot pick Duck up before the hat; only Child can.
    sim.switchTo("adult");
    sim.walk([{ x: 3.0, z: 5.5 }]);
    expect(interactHint(sim.state, LEVEL)).not.toBe("アヒルを抱える");
  });

  it("hole round trip with the real input path: Child carry, coin, back to the channel's end", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    sim.walk([{ x: 0.95, z: 5.5 }]);
    expect(inBathWater(LEVEL, sim.pos("duck"))).toBe(true);
    // Child can take Duck back to the tub (no softlock) and put it in again.
    sim.switchTo("child");
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("child");
    sim.walk([{ x: 2.6, z: 5.0 }]);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBeNull();
    expect(sim.state.duck.zone).toBe("bathwater");
    expect(sim.active).toBe("child"); // tub drop keeps control on Child
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
  it("carried Duck ignores its own input, with either carrier (moves and E)", () => {
    const early = new Sim();
    early.switchTo("child");
    early.press("interact");
    expect(early.state.duck.carriedBy).toBe("child");
    const child = { ...early.pos("child") };
    early.switchTo("duck");
    for (let i = 0; i < 60; i++) early.step({ move: { x: -1, z: 0 } });
    early.press("interact");
    expect(early.pos("child")).toEqual(child);
    expect(early.pos("duck")).toEqual(child);
    expect(early.state.duck.carriedBy).toBe("child");

    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("adult");
    const adult = { ...sim.pos("adult") };
    sim.switchTo("duck");
    for (let i = 0; i < 60; i++) sim.step({ move: { x: 1, z: 0 } });
    expect(sim.pos("adult")).toEqual(adult);
    expect(sim.pos("duck")).toEqual(adult);
  });

  it("Child: floor drop and out-of-range drop are refused, Duck stays held; Adult cannot take it from Child", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.press("interact");
    sim.walk([{ x: 3.4, z: 2.4 }, { x: 9, z: 1.5 }]); // bath floor, far from any water
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("child");
    expect(sim.lastEvents).toContainEqual({ kind: "rejected", reason: MSG.cannotPutDuckHere });
    const s = structuredClone(sim.state);
    s.child.pos = { x: 0.6, z: 4.1 }; // below the channel, > 1 m from every water point with clearance
    expect(duckDropPoint(s, LEVEL)).toBeNull();
    sim.switchTo("adult");
    sim.walk([{ x: 2.4, z: 4.2 }]);
    expect(interactHint(sim.state, LEVEL)).not.toBe("アヒルを抱える");
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
    s.duck.carriedBy = "adult"; // pure-function check of duckDropPoint (not a playthrough)
    s.items.hat = { owner: { kind: "character", id: "duck" }, status: "equipped" };
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

describe("Child as the early carrier: display and paidReturned restore", () => {
  it("view: Duck in Child's arms at hand height, facing like Child; Adult carry at chest height", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.press("interact");
    sim.walk([{ x: 3.0, z: 4.6 }]); // walk west so the facing changes
    const v = deriveView(sim.state, LEVEL);
    const d = v.characters.duck;
    expect(d).toMatchObject({ carried: true, carrier: "child" });
    expect(d.pos.y).toBe(CARRY_CENTER_Y.child);
    expect(d.pos.y).toBeLessThan(BODY_HEIGHT.child); // in the hands, not above the head
    expect([d.pos.x, d.pos.z]).toEqual([v.characters.child.pos.x, v.characters.child.pos.z]);
    const f = new FacingTracker();
    f.update(deriveView(sim.state, LEVEL));
    sim.step({ move: { x: -1, z: 0 } });
    f.update(deriveView(sim.state, LEVEL));
    expect(f.yaw("duck")).toBe(f.yaw("child"));
    expect(CARRY_CENTER_Y.adult).toBeGreaterThan(CARRY_CENTER_Y.child);
  });

  it("paidReturned saved while Child holds Duck: carrier and Duck position match; after R it is playable", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    R.duckGivesCoin(sim);
    sim.switchTo("child");
    sim.press("interact"); // Child at the entrance picks Duck up from the channel's end
    expect(sim.state.duck.carriedBy).toBe("child");
    R.adultPaysWithChild(sim);
    const snap = sim.state.checkpoints.paidReturned!;
    expect(snap.duck.carriedBy).toBe("child");
    expect(snap.duck.pos).toEqual(snap.child.pos);
    expect(snap.duck.zone).toBe(snap.child.zone);
    // Fail (F3), restore, and keep playing: Child puts Duck onto the tub.
    sim.switchTo("adult");
    sim.walk([{ x: 10.5, z: 5 }]);
    sim.walk([{ x: 13.5, z: 5 }], { run: true, allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
    sim.press("restart");
    sim.expectPlaying();
    expect(sim.state.duck.carriedBy).toBe("child");
    expect(sim.pos("duck")).toEqual(sim.pos("child"));
    sim.switchTo("child");
    sim.walk([{ x: 3.6, z: 2.5 }]);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBeNull();
    expect(sim.state.duck.zone).toBe("bathwater");
    R.adultGivesKey(sim);
    R.childUnlocksSauna(sim);
  });
});
