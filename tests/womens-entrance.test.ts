// 女湯 entrance and F8 (2026-11-20 user request; prototype-core-gameplay
// Req 7.11–7.14). Real-input runs use the Sim driver; the carried-Duck and
// free-Duck cases put characters in the lobby directly, because the normal
// route never brings a free Duck onto the lobby floor.
import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { decideOutcome, pushesIntoWomensEntrance, WOMENS_ENTRY_MARGIN } from "../src/core/rules";
import { MSG, VIOLATION_TEXT } from "../src/core/text";
import { tick } from "../src/core/tick";
import { RUN_SPEED, DT } from "../src/core/tuning";
import { type CharacterId, EMPTY_INPUT, type GameState, type HumanId, type Vec2 } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox } from "../src/sim/geometry";
import { stepWalk, wallsFor } from "../src/sim/movement";
import { zoneAt } from "../src/sim/zones";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const E = LEVEL.womensEntrance;
const W = LEVEL.waypoints;
const FACE = E.step.maxX;
const MID_Z = (E.doorway.minZ + E.doorway.maxZ) / 2;
const IN: Vec2 = E.inward;
/** Lobby floor point `dist` m in front of the step for a body of radius r, at lateral z. */
const front = (r: number, dist: number, z = MID_Z): Vec2 => ({ x: FACE + r + dist, z });
const lobbyDoorIn: Vec2 = { x: 4.8, z: -7.0 };
const lobbyIn: Vec2 = { x: 2.0, z: MID_Z };

/** Real input: both humans dress and go round the screen into reception (no payment). */
function pairToReception(sim: Sim): void {
  R.pairToChanging(sim);
  R.pairToggleClothes(sim, W.lockerAisle);
  sim.walk([W.screenPassage, W.screenWait]);
  sim.switchTo("adult");
  sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn]);
  expect(sim.state.adult.zone).toBe("reception");
  expect(sim.state.child.zone).toBe("reception");
}

/** Hold one direction until the game ends or `n` ticks pass; returns the min x reached by every body. */
function hold(sim: Sim, move: Vec2, n: number, run = false): number {
  let minX = Infinity;
  for (let i = 0; i < n && sim.state.outcome.kind === "playing"; i++) {
    sim.step({ move, run });
    for (const id of ["adult", "child", "duck"] as const) minX = Math.min(minX, sim.state[id].pos.x - CHARACTER_RADIUS[id]);
  }
  return minX;
}

/** Direct state: the given human clothed and dry in the lobby at `pos`, optionally carrying Duck. */
function inLobby(id: HumanId, pos: Vec2, carrying = false): GameState {
  const s = createInitialState(LEVEL);
  for (const h of ["adult", "child"] as const) {
    s[h].clothing = "clothed";
    s[h].wet = "dry";
  }
  s[id].pos = pos;
  s[id].zone = "common";
  s.active = id;
  if (carrying) {
    s.duck.carriedBy = id;
    s.duck.pos = { ...pos };
    s.duck.zone = "common";
    // Child carries before the hat, Adult after it (invariant).
    if (id === "adult") s.items.hat = { owner: { kind: "character", id: "duck" }, status: "equipped" };
  }
  return s;
}

function simFrom(s: GameState): Sim {
  const sim = new Sim();
  sim.state = s;
  return sim;
}

describe("women's entrance: geometry from LEVEL", () => {
  it("is in the lobby wall, with a solid raised step across the whole doorway and a closed vestibule", () => {
    expect(zoneAt(LEVEL, front(0.35, 0.1))).toBe("common");
    expect(E.step.minZ).toBeLessThanOrEqual(E.doorway.minZ);
    expect(E.step.maxZ).toBeGreaterThanOrEqual(E.doorway.maxZ);
    const step = LEVEL.fixtures.find((f) => f.box === E.step)!;
    expect(step.kind).toBe("step");
    expect(step.height).toBeGreaterThan(CHARACTER_RADIUS.duck); // higher than Duck can climb (visible step)
    expect(LEVEL.walls).toContain(E.step);
    // No zone (interior) behind the entrance and no door that could move a companion there.
    expect(zoneAt(LEVEL, { x: (E.step.minX + E.doorway.minX) / 2, z: MID_Z })).toBeNull();
    expect(LEVEL.doors.some((d) => circleOverlapsBox({ x: E.doorway.minX, z: MID_Z }, 0.5, d.box))).toBe(false);
  });

  it("shows 男湯 at the men's entry, 女湯 at the doorway, and a receptionist behind the desk", () => {
    const men = LEVEL.decor.find((d) => d.kind === "norenMen")!;
    const women = LEVEL.decor.find((d) => d.kind === "norenWomen")!;
    expect(men.label).toBe("男湯");
    expect(women.label).toBe("女湯");
    const changingDoor = LEVEL.doors.find((d) => d.id === "changing_reception")!.box;
    expect(men.box.minX).toBe(changingDoor.minX);
    expect(women.box.minZ).toBe(E.doorway.minZ);
    const staff = LEVEL.fixtures.find((f) => f.kind === "staff")!;
    const desk = LEVEL.fixtures.find((f) => f.kind === "desk")!;
    expect(staff.label).toBe("受付の人");
    expect(staff.box.maxZ).toBeLessThanOrEqual(desk.box.minZ); // behind the desk (wall side)
    expect(zoneAt(LEVEL, { x: (staff.box.minX + staff.box.maxX) / 2, z: staff.box.minZ })).toBe("reception");
  });

  it("the receptionist sees the 女湯 doorway over the counter window; bodies cannot pass the window", () => {
    const staff = LEVEL.fixtures.find((f) => f.kind === "staff")!;
    const eyeY = staff.height - 0.1;
    const eye = { x: (staff.box.minX + staff.box.maxX) / 2, z: (staff.box.minZ + staff.box.maxZ) / 2 };
    const fixtureBoxes = new Set(LEVEL.fixtures.map((f) => f.box));
    // Full-height walls, and fixtures at least as tall as the eye, block the view (not the staff body itself).
    const blockers = [
      ...LEVEL.walls.filter((w) => !fixtureBoxes.has(w)),
      ...LEVEL.fixtures.filter((f) => f.height >= eyeY && f !== staff).map((f) => f.box),
    ];
    const hits = (a: Vec2, b: Vec2, bx: { minX: number; maxX: number; minZ: number; maxZ: number }) => {
      for (let i = 1; i < 200; i++) {
        const t = i / 200;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        if (x > bx.minX && x < bx.maxX && z > bx.minZ && z < bx.maxZ) return true;
      }
      return false;
    };
    for (const z of [E.doorway.minZ + 0.1, MID_Z, E.doorway.maxZ - 0.1]) {
      const door = { x: E.step.maxX, z };
      expect(blockers.some((w) => hits(eye, door, w)), `eye → doorway z=${z}`).toBe(false);
    }
    // The window is filled by a low counter: nobody walks from the lobby into the staff area.
    const walls = wallsFor(LEVEL, "locked");
    const counter = LEVEL.fixtures.find((f) => f.kind === "desk" && f.box.minX < 4 && f.box.maxX > 4)!.box;
    for (const id of ["duck", "child", "adult"] as CharacterId[]) {
      const r = CHARACTER_RADIUS[id];
      for (let z = -8.5; z <= -7.9 + 1e-9; z += 0.2) {
        let p = { x: 3.0, z };
        for (let i = 0; i < 120; i++) p = stepWalk(id, p, { x: 1, z: 0 }, false, walls);
        expect(p.x + r, `${id} z=${z.toFixed(1)}`).toBeLessThanOrEqual(counter.minX + 1e-6);
      }
    }
  });

  it("no body gets past the step: every radius, lateral offset, angle and run speed", () => {
    const walls = wallsFor(LEVEL, "locked");
    for (const id of ["duck", "child", "adult"] as CharacterId[]) {
      const r = CHARACTER_RADIUS[id];
      for (let z = E.doorway.minZ - 0.4; z <= E.doorway.maxZ + 0.4; z += 0.1) {
        for (const a of [0, 0.3, -0.3, 0.6, -0.6, 1.0, -1.0]) {
          const move = { x: -Math.cos(a), z: Math.sin(a) };
          let p = { x: FACE + r + 0.8, z };
          for (let i = 0; i < 120; i++) {
            p = stepWalk(id, p, move, id !== "duck", walls);
            const tag = `${id} z=${z.toFixed(2)} a=${a}`;
            expect(p.x - r, tag).toBeGreaterThanOrEqual(-1e-6); // never into the wall line or the vestibule
            expect(circleOverlapsBox(p, r - 1e-3, E.step), tag).toBe(false); // never onto the step
          }
        }
      }
    }
    expect(RUN_SPEED * DT).toBeLessThan(WOMENS_ENTRY_MARGIN); // a run tick cannot skip the margin
  });
});

describe("women's entrance: F8 with real input", () => {
  it("Adult walking straight in is reprimanded (F8) at the step and never gets through", () => {
    const sim = new Sim();
    pairToReception(sim);
    sim.walk([lobbyDoorIn, lobbyIn]);
    expect(sim.state.adult.zone).toBe("common");
    const minX = hold(sim, IN, 200);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F8" });
    expect(minX).toBeGreaterThanOrEqual(FACE - 1e-6);
    expect(sim.state.adult.zone).toBe("common");

    // Input is frozen until restart; restart returns to the checkpoint and the held key does not repeat F8.
    const frozen = sim.state.adult.pos;
    sim.step({ move: IN });
    expect(sim.state.adult.pos).toEqual(frozen);
    sim.press("restart");
    expect(sim.state.outcome).toEqual({ kind: "playing" });
    expect(sim.state.adult.zone).not.toBe("common");
    hold(sim, IN, 120);
    expect(sim.state.outcome).toEqual({ kind: "playing" });
  });

  it("Child walking in diagonally gets F8 too", () => {
    const sim = new Sim();
    pairToReception(sim);
    sim.switchTo("child");
    sim.walk([lobbyDoorIn, { x: 1.0, z: E.doorway.maxZ - 0.2 }]);
    hold(sim, { x: -Math.SQRT1_2, z: -Math.SQRT1_2 }, 200);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F8" });
    expect(sim.state.child.pos.x - CHARACTER_RADIUS.child).toBeGreaterThanOrEqual(FACE - 1e-6);
  });

  it("Adult running in gets F8 and is stopped at the step", () => {
    const sim = new Sim();
    pairToReception(sim);
    sim.walk([lobbyDoorIn, lobbyIn]);
    const minX = hold(sim, IN, 200, true);
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F8" });
    expect(minX).toBeGreaterThanOrEqual(FACE - 1e-6);
  });

  it("walking past, standing, leaving, switching and the inactive companion near it do not trigger F8", () => {
    const sim = new Sim();
    pairToReception(sim);
    const a = CHARACTER_RADIUS.adult;
    sim.walk([lobbyDoorIn, front(a, 0.05, E.doorway.minZ - 0.4)]);
    // Parallel along the step face, through the whole doorway span and back.
    sim.walk([front(a, 0.05, E.doorway.maxZ + 0.4), front(a, 0.05, MID_Z)]);
    sim.idle(120); // standing at the step, looking at it (the camera is view only)
    sim.walk([{ x: 3.0, z: MID_Z }]); // moving away
    sim.walk([front(a, WOMENS_ENTRY_MARGIN + 0.1)]); // walking up to just outside the margin
    // Child comes and stands near the step too; switching between them is not an attempt.
    sim.switchTo("child");
    sim.walk([lobbyDoorIn, front(CHARACTER_RADIUS.child, 0.6, E.doorway.minZ + 0.25)]);
    for (let i = 0; i < 4; i++) sim.press("switchCharacter");
    sim.switchTo("adult");
    sim.walk([{ x: 3.0, z: MID_Z }, lobbyDoorIn]); // the active Adult leaves; nobody moves the Child in
    // Pushing the lobby wall beside the doorway (outside its span) is not an attempt.
    sim.walk([{ x: 1.0, z: E.doorway.minZ - 0.4 }]);
    hold(sim, IN, 60);
    sim.walk([{ x: 1.0, z: E.doorway.maxZ + 0.4 }]);
    hold(sim, IN, 60);
    expect(sim.state.outcome).toEqual({ kind: "playing" });
    expect(sim.log.some((e) => e.kind === "gameOver")).toBe(false);
  });
});

describe("women's entrance: carried and free Duck (direct state)", () => {
  it("Adult or Child carrying Duck gets the same F8; nobody and no Duck gets through", () => {
    for (const id of ["adult", "child"] as const) {
      const sim = simFrom(inLobby(id, front(CHARACTER_RADIUS[id], 0.4), true));
      const minX = hold(sim, IN, 120);
      expect(sim.state.outcome, id).toEqual({ kind: "gameOver", reason: "F8" });
      expect(sim.state.duck.carriedBy).toBe(id);
      expect(minX).toBeGreaterThanOrEqual(FACE - 1e-6);
    }
  });

  it("active Duck while carried ignores its input and does not trigger anything", () => {
    const sim = simFrom(inLobby("adult", front(CHARACTER_RADIUS.adult, 0.02), true));
    sim.switchTo("duck");
    const at = sim.state.duck.pos;
    hold(sim, IN, 60);
    expect(sim.state.duck.pos).toEqual(at);
    expect(sim.state.outcome).toEqual({ kind: "playing" });
  });

  it("a free Duck at the step is blocked, gets the step hint, and never F8 or the reprimand", () => {
    // Tick directly: the Sim's water invariant rejects a free Duck on the floor.
    let s = createInitialState(LEVEL);
    s.duck.pos = front(CHARACTER_RADIUS.duck, 0.05);
    s.duck.zone = "common";
    const start = s.duck.pos;
    const prompts: string[] = [];
    for (let i = 0; i < 60; i++) {
      const r = tick(s, { ...EMPTY_INPUT, move: IN }, LEVEL);
      s = r.state;
      for (const e of r.events) if (e.kind === "prompt") prompts.push(e.text);
    }
    expect(s.outcome).toEqual({ kind: "playing" });
    expect(s.duck.pos).toEqual(start);
    expect(prompts).toContain(MSG.duckStepTooHigh);
    expect(pushesIntoWomensEntrance(LEVEL, s.duck.pos, CHARACTER_RADIUS.duck, { x: 1, z: 0 })).toBe(false);
  });
});

describe("F8 rule details", () => {
  const r = CHARACTER_RADIUS.adult;
  it("counts straight and diagonal pushes at the doorway, not parallel, away, idle or beside it", () => {
    const at = front(r, 0.05);
    expect(pushesIntoWomensEntrance(LEVEL, at, r, IN)).toBe(true);
    expect(pushesIntoWomensEntrance(LEVEL, at, r, { x: -0.7, z: 0.7 })).toBe(true);
    expect(pushesIntoWomensEntrance(LEVEL, at, r, { x: 0, z: 1 })).toBe(false);
    expect(pushesIntoWomensEntrance(LEVEL, at, r, { x: -0.3, z: 1 })).toBe(false); // mostly parallel
    expect(pushesIntoWomensEntrance(LEVEL, at, r, { x: 1, z: 0 })).toBe(false);
    expect(pushesIntoWomensEntrance(LEVEL, at, r, { x: 0, z: 0 })).toBe(false);
    expect(pushesIntoWomensEntrance(LEVEL, front(r, WOMENS_ENTRY_MARGIN + 0.05), r, IN)).toBe(false);
    expect(pushesIntoWomensEntrance(LEVEL, front(r, 0.05, E.doorway.minZ - 0.05), r, IN)).toBe(false);
    expect(pushesIntoWomensEntrance(LEVEL, front(r, 0.05, E.doorway.maxZ + 0.05), r, IN)).toBe(false);
  });

  it("F8 comes after F1–F7 and still beats clear on the same tick", () => {
    expect(decideOutcome(["F8", "F7"], false)).toEqual({ kind: "gameOver", reason: "F7" });
    expect(decideOutcome(["F8", "F1"], false)).toEqual({ kind: "gameOver", reason: "F1" });
    expect(decideOutcome(["F8"], true)).toEqual({ kind: "gameOver", reason: "F8" });
  });

  it("the game-over text names the receptionist and the exact line", () => {
    expect(VIOLATION_TEXT.F8.speech).toEqual({ speaker: "受付の人", line: "こら、そちらは女湯です！男湯はあちらですよ！" });
    for (const id of ["F1", "F2", "F3", "F4", "F5", "F6", "F7"] as const) expect(VIOLATION_TEXT[id].speech).toBeUndefined();
  });
});
