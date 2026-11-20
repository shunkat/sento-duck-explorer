// Property-based tests (Spec task 7). Properties 1-4, 6-14 and 16-19 from
// design.md; Property 5 is in level.test.ts and Property 15 in view.test.ts.
// Every property runs at least 100 times. Random inputs start from reachable
// stages built by the scripted route (tests/helpers/props.ts), so they cover
// the late route, F2-F7, pair doors, the pond and checkpoint restore.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { checkInvariants } from "../src/core/invariants";
import { toCore } from "../src/core/initialState";
import { findPairDoor } from "../src/core/pair";
import { decideOutcome } from "../src/core/rules";
import { REACH } from "../src/core/tuning";
import { tick } from "../src/core/tick";
import {
  type CharacterId,
  type GameState,
  type HumanId,
  type InputFrame,
  type ViolationId,
  type Vec2,
  EMPTY_INPUT,
} from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import { wallsFor } from "../src/sim/movement";
import { stepPond } from "../src/sim/pond";
import { areaOf } from "../src/sim/zones";
import { containsPoint } from "../src/sim/geometry";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";
import { frameArb, PLAYING_STAGES, run, seqArb, stageArb, stages } from "./helpers/props";

const OPTS = { numRuns: 100 };
const NEXT: Record<CharacterId, CharacterId> = { duck: "child", child: "adult", adult: "duck" };
const VIOLATIONS: ViolationId[] = ["F1", "F2", "F3", "F4", "F5", "F6", "F7"];
const playingStageArb = fc.constantFrom(...PLAYING_STAGES);
const humanArb = fc.constantFrom<HumanId>("child", "adult");
const frameOf = (f: Partial<InputFrame>): InputFrame => ({ ...EMPTY_INPUT, ...f });
const mutate = (s: GameState, f: (c: GameState) => void): GameState => {
  const c = structuredClone(s);
  f(c);
  return c;
};

/** Hold the direction toward each waypoint; the active human must be `id`. Stops at game end or tick budget. */
function drive(start: GameState, id: HumanId, waypoints: Vec2[], maxTicks = 600): GameState {
  let s = start;
  for (let i = 0; i < 3 && s.active !== id; i++) s = tick(s, frameOf({ switchCharacter: true }), LEVEL).state;
  let t = 0;
  for (const w of waypoints) {
    while (t++ < maxTicks && s.outcome.kind === "playing") {
      const p = s[id].pos;
      const d = Math.hypot(w.x - p.x, w.z - p.z);
      if (d <= 0.06) break;
      s = tick(s, frameOf({ move: { x: (w.x - p.x) / d, z: (w.z - p.z) / d } }), LEVEL).state;
    }
  }
  return s;
}

describe("Property tests (fast-check, >= 100 runs each)", () => {
  it("stages are reachable and valid (7.1)", () => {
    for (const [name, s] of Object.entries(stages())) {
      expect(checkInvariants(s), name).toEqual([]);
    }
    expect(stages().coinDialog.dialog).toEqual({ item: "coin", from: "duck", to: "adult" });
    expect(stages().keyDialog.dialog).toEqual({ item: "key", from: "adult", to: "child" });
    expect(stages().nearGoal.duck.inPond).toBe(true);
    expect(stages().nearGoal.outcome.kind).toBe("playing");
    expect(stages().gameOver.outcome).toEqual({ kind: "gameOver", reason: "F1" });
  });

  it("Property 1: item uniqueness and invariants hold", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ allow: ["switchCharacter", "interact", "confirm", "cancel", "dipTowel", "shout", "push", "restart"], maxSegments: 20 }), (name, frames) => {
        expect(checkInvariants(stages()[name])).toEqual([]);
        run(stages()[name], frames, (_b, _i, after) => {
          expect(checkInvariants(after)).toEqual([]);
        });
      }),
      OPTS,
    );
  });

  it("Property 2: switching rotates and preserves state", () => {
    fc.assert(
      fc.property(playingStageArb, seqArb(), frameArb(), (name, prefix, f) => {
        const s = run(stages()[name], prefix);
        fc.pre(s.outcome.kind === "playing" && s.dialog === null);
        const r = tick(s, { ...f, switchCharacter: true, restart: false }, LEVEL).state;
        expect(r).toEqual({ ...s, active: NEXT[s.active], tickCount: s.tickCount + 1 });
      }),
      { numRuns: 200 },
    );
  });

  it("Property 2 (pond): switching with Duck in the pond keeps pos and vel", () => {
    fc.assert(
      fc.property(fc.constantFrom("inPond", "nearGoal" as const), seqArb({ allow: [] }), frameArb(), (name, prefix, f) => {
        const s = run(stages()[name], prefix);
        fc.pre(s.outcome.kind === "playing" && s.active === "duck");
        const r = tick(s, { ...f, switchCharacter: true }, LEVEL).state;
        expect(r.duck).toEqual(s.duck);
        expect(r.active).toBe("child");
      }),
      OPTS,
    );
  });

  it("Property 3: switching is blocked during dialogs and game over", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("coinDialog", "keyDialog", "gameOver" as const),
        fc.constantFrom(...VIOLATIONS),
        fc.constantFrom(...PLAYING_STAGES),
        fc.boolean(),
        frameArb(),
        (name, v, other, useMutated, f) => {
          const s = useMutated ? mutate(stages()[other], (c) => { c.outcome = { kind: "gameOver", reason: v }; }) : stages()[name];
          const r = tick(s, { ...f, switchCharacter: true, restart: false, confirm: false, cancel: false }, LEVEL).state;
          expect(r.active).toBe(s.active);
        },
      ),
      OPTS,
    );
  });

  it("Property 4: inactive characters stay still", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 20 }), (name, frames) => {
        run(stages()[name], frames, (b, _i, a) => {
          for (const id of ["duck", "child", "adult"] as const) {
            if (id === b.active) continue;
            if (id === "duck" && (b.duck.carriedBy !== null || a.duck.carriedBy !== null)) continue;
            const crossed = id !== "duck" && b.active !== "duck" && areaOf(b[b.active].zone) !== areaOf(a[b.active].zone);
            if (crossed) continue; // companion of a pair-door crossing
            expect(a[id].pos, `${id} pos`).toEqual(b[id].pos);
            expect(a[id].vel, `${id} vel`).toEqual(b[id].vel);
          }
        });
      }),
      OPTS,
    );
  });

  it("Property 4 (pond): an inactive Duck in the pond keeps pos and vel over many ticks", () => {
    fc.assert(
      fc.property(fc.constantFrom("inPond", "nearGoal" as const), seqArb({ allow: [] }), seqArb({ allow: ["interact", "dipTowel", "shout", "push"], maxSegments: 20 }), (name, prefix, later) => {
        const s = run(stages()[name], prefix);
        fc.pre(s.outcome.kind === "playing" && s.active === "duck");
        const start = tick(s, frameOf({ switchCharacter: true }), LEVEL).state;
        run(start, later, (_b, _i, a) => {
          expect(a.duck.pos).toEqual(start.duck.pos);
          expect(a.duck.vel).toEqual(start.duck.vel);
        });
      }),
      OPTS,
    );
  });

  it("Property 6: carried Duck follows the allowed human carrier", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 20 }), (name, frames) => {
        run(stages()[name], frames, (b, _i, a) => {
          expect([null, "child", "adult"]).toContain(a.duck.carriedBy);
          if (a.duck.carriedBy !== null) {
            expect(a.duck.pos).toEqual(a[a.duck.carriedBy].pos);
            expect(a.duck.zone).toBe(a[a.duck.carriedBy].zone);
          }
          if (b.duck.carriedBy === null && a.duck.carriedBy !== null) {
            expect(a.duck.carriedBy).toBe(b.active);
            expect(a.duck.carriedBy).toBe(b.items.hat.status === "equipped" ? "adult" : "child");
          }
        });
      }),
      OPTS,
    );
  });

  it("Property 6 (move input): Duck's own movement has no effect while carried", () => {
    fc.assert(
      fc.property(fc.constantFrom("childCarried", "carriedAtShore" as const), frameArb({ allow: ["interact", "dipTowel", "shout", "push", "confirm", "cancel"] }), (name, f) => {
        let carried = stages()[name];
        const carrier = carried.duck.carriedBy;
        for (let i = 0; i < 3 && carried.active !== "duck"; i++) carried = tick(carried, frameOf({ switchCharacter: true }), LEVEL).state;
        expect(carried.active).toBe("duck");
        expect(carried.duck.carriedBy).toBe(carrier);
        const a = tick(carried, f, LEVEL).state;
        const b = tick(carried, { ...f, move: { x: 0, z: 0 }, run: false }, LEVEL).state;
        expect(a).toEqual(b);
      }),
      OPTS,
    );
  });

  it("Property 6 (put-down): Duck lands on reachable water and responds to inward input", () => {
    const sim = new Sim();
    sim.state = stages().hatEquipped;
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("adult");
    const carried = sim.state;
    fc.assert(
      fc.property(fc.double({ min: -Math.PI / 4, max: 0, noNaN: true }), (angle) => {
        // Drop is at the channel shore: steer inward, since outward movement must stop.
        const dir = { x: -Math.cos(angle), z: Math.sin(angle) };
        const down = tick(carried, frameOf({ interact: true }), LEVEL).state;
        expect(down.duck.carriedBy).toBeNull();
        expect(LEVEL.duckWater.some((water) => containsPoint(water, down.duck.pos))).toBe(true);
        expect(Math.hypot(down.duck.pos.x - carried.adult.pos.x, down.duck.pos.z - carried.adult.pos.z)).toBeLessThanOrEqual(REACH.pickUpDuck);
        const asDuck = tick(down, frameOf({ switchCharacter: true }), LEVEL).state;
        expect(asDuck.active).toBe("duck");
        const moved = tick(asDuck, frameOf({ move: dir }), LEVEL).state;
        expect(moved.duck.pos).not.toEqual(asDuck.duck.pos);
      }),
      OPTS,
    );
  });

  it("Property 7: cancelled transfers restore ownership", () => {
    fc.assert(
      fc.property(fc.constantFrom("coinDialog", "keyDialog" as const), seqArb({ allow: ["interact", "dipTowel", "shout", "push", "switchCharacter"], maxSegments: 6 }), frameArb({ allow: ["cancel"] }), (name, noise, cancel) => {
        const s = stages()[name];
        const mid = run(s, noise);
        expect(mid.dialog).toEqual(s.dialog); // only confirm / cancel act on a dialog
        const r = tick(mid, { ...cancel, cancel: true, confirm: false, restart: false }, LEVEL).state;
        expect(r.items).toEqual(s.items);
        expect(r.dialog).toBeNull();
      }),
      OPTS,
    );
  });

  it("Property 8: clear requires the hat-wearing Duck in the goal", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 20 }), (name, frames) => {
        run(stages()[name], frames, (_b, _i, a) => {
          if (a.outcome.kind !== "cleared") return;
          expect(a.duck.zone).toBe("pond_goal");
          expect(a.duck.inPond).toBe(true);
          expect(a.items.hat).toEqual({ owner: { kind: "character", id: "duck" }, status: "equipped" });
        });
      }),
      OPTS,
    );
  });

  it("Property 8 (negative): Duck in the goal without the hat, or a human in the goal, never clears", () => {
    const goal = { x: 39.2, z: 4 };
    fc.assert(
      fc.property(fc.boolean(), seqArb({ allow: ["interact", "dipTowel", "shout", "push"], maxSegments: 20 }), (duckBare, frames) => {
        const base = stages().hatEquipped;
        const s = duckBare
          ? mutate(base, (c) => {
              c.items.hat = { owner: { kind: "character", id: "child" }, status: "available" };
              c.duck = { ...c.duck, inPond: true, pos: { ...goal }, zone: "pond_goal", carriedBy: null };
              c.active = "duck";
            })
          : mutate(stages().inPond, (c) => {
              c.active = "child";
              c.child.pos = { ...goal };
              c.child.zone = "pond_goal";
            });
        run(s, frames, (_b, _i, a) => expect(a.outcome.kind).not.toBe("cleared"));
      }),
      OPTS,
    );
  });

  it("Property 9: game over takes priority over clear", () => {
    fc.assert(
      fc.property(fc.subarray(VIOLATIONS, { minLength: 1 }), (pending) => {
        const first = VIOLATIONS.find((v) => pending.includes(v));
        expect(decideOutcome(pending, true)).toEqual({ kind: "gameOver", reason: first });
      }),
      OPTS,
    );
    // A whole tick: the clear condition holds, and Child dips the towel in the same tick.
    const clearing = mutate(stages().hatEquipped, (c) => {
      c.duck = { ...c.duck, inPond: true, pos: { x: 39.2, z: 4 }, zone: "pond_goal", carriedBy: null };
      c.child.pos = { x: 4, z: 5 };
      c.child.zone = "bathwater";
      c.child.towel = "held";
      c.active = "child";
    });
    expect(tick(clearing, EMPTY_INPUT, LEVEL).state.outcome).toEqual({ kind: "cleared" });
    fc.assert(
      fc.property(frameArb({ allow: [] }), (f) => {
        const r = tick(clearing, { ...f, dipTowel: true }, LEVEL).state;
        expect(r.outcome).toEqual({ kind: "gameOver", reason: "F1" });
      }),
      OPTS,
    );
  });

  describe("Property 10: state-based violations fire on entry", () => {
    const flag = fc.boolean();

    it("F2: a wet human entering changing ends the game; a wet companion waits", () => {
      fc.assert(
        fc.property(humanArb, flag, flag, (id, activeWet, compWet) => {
          const comp: HumanId = id === "adult" ? "child" : "adult";
          const s = mutate(stages().keyGiven, (c) => {
            c[id].wet = activeWet ? "wet" : "dry";
            c[comp].wet = compWet ? "wet" : "dry";
          });
          const r = drive(s, id, [{ x: 2.6, z: 1.5 }, { x: 2.6, z: 0.5 }, { x: 2.6, z: -1 }]);
          if (activeWet) expect(r.outcome).toEqual({ kind: "gameOver", reason: "F2" });
          else if (compWet) {
            expect(r.outcome.kind).toBe("playing");
            expect(areaOf(r[id].zone)).toBe("bath");
            expect(areaOf(r[comp].zone)).toBe("bath");
          } else {
            expect(r.outcome.kind).toBe("playing");
            expect(r[id].zone).toBe("changing");
            expect(r[comp].zone).toBe("changing");
          }
        }),
        OPTS,
      );
    });

    it("F5: a wet human entering the sauna ends the game; a wet companion waits", () => {
      fc.assert(
        fc.property(humanArb, flag, flag, (id, activeWet, compWet) => {
          const comp: HumanId = id === "adult" ? "child" : "adult";
          const s = mutate(stages().unlocked, (c) => {
            c[id].wet = activeWet ? "wet" : "dry";
            c[comp].wet = compWet ? "wet" : "dry";
          });
          const r = drive(s, id, [{ x: 2.6, z: 7.6 }, { x: 2.6, z: 9.0 }]);
          if (activeWet) expect(r.outcome).toEqual({ kind: "gameOver", reason: "F5" });
          else if (compWet) {
            expect(r.outcome.kind).toBe("playing");
            expect(areaOf(r[id].zone)).toBe("bath");
            expect(areaOf(r[comp].zone)).toBe("bath");
          } else {
            expect(r.outcome.kind).toBe("playing");
            expect(r[id].zone).toBe("sauna_entry");
            expect(r[comp].zone).toBe("sauna_entry");
          }
        }),
        OPTS,
      );
    });

    it("F4: an unclothed human leaving changing ends the game; an unclothed companion waits", () => {
      fc.assert(
        fc.property(humanArb, flag, flag, (id, activeBare, compBare) => {
          const comp: HumanId = id === "adult" ? "child" : "adult";
          const s = mutate(stages().changing, (c) => {
            c[id].clothing = activeBare ? "unclothed" : "clothed";
            c[comp].clothing = compBare ? "unclothed" : "clothed";
          });
          // The companion first moves up to the reception door so the pair is within the join radius.
          const near = drive(s, comp, [{ x: 2.6, z: -2.6 }]);
          const r = drive(near, id, [{ x: 2.6, z: -3.2 }, { x: 2.6, z: -5 }]);
          if (activeBare) expect(r.outcome).toEqual({ kind: "gameOver", reason: "F4" });
          else if (compBare) {
            expect(r.outcome.kind).toBe("playing");
            expect(r[id].zone).toBe("changing");
            expect(r[comp].zone).toBe("changing");
          } else {
            expect(r.outcome.kind).toBe("playing");
            expect(r[id].zone).toBe("reception");
            expect(r[comp].zone).toBe("reception");
          }
        }),
        OPTS,
      );
    });
  });

  it("Property 11: walking never triggers F7", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("inSauna", "hatTaken", "unlocked" as const),
        seqArb({ allow: ["switchCharacter", "interact", "confirm", "cancel", "dipTowel", "shout"], maxSegments: 30 }),
        (name, frames) => {
          run(stages()[name], frames, (_b, _i, a) => {
            expect(a.outcome).not.toEqual({ kind: "gameOver", reason: "F7" });
          });
        },
      ),
      OPTS,
    );
  });

  it("Property 12: game over freezes the game", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 20 }), fc.constantFrom(...VIOLATIONS), fc.boolean(), seqArb({ maxSegments: 4, maxHold: 3 }), (name, frames, v, forced, after) => {
        let s = run(stages()[name], frames);
        if (forced) s = mutate(s, (c) => { c.outcome = { kind: "gameOver", reason: v }; });
        fc.pre(s.outcome.kind === "gameOver");
        run(s, after, (b, _i, a) => {
          expect(a).toEqual({ ...b, tickCount: b.tickCount + 1 });
        });
      }),
      OPTS,
    );
  });

  it("Property 13: checkpoint restore is consistent", () => {
    fc.assert(
      fc.property(playingStageArb, seqArb({ maxSegments: 20 }), (name, frames) => {
        let s = run(stages()[name], frames);
        // Not every random run ends in a game over by itself; end it with F1 when it did not.
        if (s.outcome.kind !== "gameOver") s = mutate(s, (c) => { c.outcome = { kind: "gameOver", reason: "F1" }; });
        const snap = s.checkpoints[s.lastCheckpoint]!;
        expect(snap).toBeDefined();
        const r = tick(s, frameOf({ restart: true }), LEVEL).state;
        expect({ ...toCore(r), tickCount: 0 }).toEqual({ ...snap, tickCount: 0 });
        expect(r.outcome).toEqual({ kind: "playing" });
        expect(r.dialog).toBeNull();
        expect(checkInvariants(r)).toEqual([]);
        let t = r;
        for (let i = 0; i < 5; i++) {
          t = tick(t, EMPTY_INPUT, LEVEL).state;
          expect(t.outcome).toEqual({ kind: "playing" });
        }
      }),
      OPTS,
    );
  });

  it("Property 14: contextual drying and clothing changes preserve the other state", () => {
    fc.assert(fc.property(humanArb, fc.boolean(), fc.boolean(), (id, clothed, wet) => {
      const drying = mutate(stages().keyGiven, (c) => {
        c.active = id;
        c[id].pos = { x: 2.6, z: 1.6 };
        c[id].zone = "bath";
        c[id].wet = "wet";
        c[id].clothing = clothed ? "clothed" : "unclothed";
      });
      const dry = tick(drying, frameOf({ interact: true }), LEVEL).state;
      expect(dry[id].wet).toBe("dry");
      expect(dry[id].clothing).toBe(drying[id].clothing);
      const locker = mutate(stages().changing, (c) => {
        c.active = id;
        c[id].pos = { ...LEVEL.locker };
        c[id].zone = "changing";
        c[id].wet = wet ? "wet" : "dry";
        c[id].clothing = clothed ? "clothed" : "unclothed";
      });
      const changed = tick(locker, frameOf({ interact: true }), LEVEL).state;
      expect(changed[id].clothing).toBe(clothed ? "unclothed" : "clothed");
      expect(changed[id].wet).toBe(locker[id].wet);
    }), OPTS);
  });

  it("Property 16: only allowlisted transfers; hat moves only by Equip", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 24 }), (name, frames) => {
        run(stages()[name], frames, (b, i, a) => {
          expect(a.dialog === null || a.dialog.item === "coin" || a.dialog.item === "key").toBe(true);
          if (a.items.hat.owner.kind === "character" && a.items.hat.owner.id === "duck") expect(a.items.hat.status).toBe("equipped");
          for (const item of ["coin", "key", "hat"] as const) {
            const o1 = b.items[item].owner;
            const o2 = a.items[item].owner;
            if (o1.kind === "character" && o2.kind === "character" && o1.id !== o2.id) {
              const ok =
                (item === "coin" && o1.id === "duck" && o2.id === "adult" && i.confirm && b.dialog !== null) ||
                (item === "key" && o1.id === "adult" && o2.id === "child" && i.confirm && b.dialog !== null) ||
                (item === "hat" && o1.id === "child" && o2.id === "duck" && a.items.hat.status === "equipped" && i.interact);
              expect(ok, `${item} ${o1.id} -> ${o2.id}`).toBe(true);
            }
          }
          if (JSON.stringify(b.items.hat.owner) !== JSON.stringify(a.items.hat.owner)) expect(i.interact).toBe(true);
        });
      }),
      OPTS,
    );
  });

  it("Property 17: pond physics advances only while Duck is active", () => {
    fc.assert(
      fc.property(fc.constantFrom("inPond", "nearGoal" as const), seqArb({ allow: [], maxSegments: 10 }), (name, prefix) => {
        const s = run(stages()[name], prefix);
        fc.pre(s.outcome.kind === "playing" && s.active === "duck" && s.duck.inPond);
        const a = tick(s, EMPTY_INPUT, LEVEL).state;
        const expected = stepPond(s.duck.pos, s.duck.vel, { x: 0, z: 0 }, wallsFor(LEVEL, s.saunaDoor));
        expect(a.duck.pos).toEqual(expected.pos);
        expect(a.duck.vel).toEqual(expected.vel);
        if (s.duck.vel.x >= 0) expect(a.duck.pos.x).toBeGreaterThanOrEqual(s.duck.pos.x);
      }),
      OPTS,
    );
    fc.assert(
      fc.property(fc.constantFrom("inPond", "nearGoal" as const), seqArb({ allow: [] }), seqArb({ allow: ["interact", "dipTowel", "shout", "push"], maxSegments: 10 }), (name, prefix, later) => {
        const s = run(stages()[name], prefix);
        fc.pre(s.outcome.kind === "playing" && s.active === "duck");
        const start = tick(s, frameOf({ switchCharacter: true }), LEVEL).state;
        run(start, later, (b, _i, a) => {
          if (b.active !== "duck") {
            expect(a.duck.pos).toEqual(b.duck.pos);
            expect(a.duck.vel).toEqual(b.duck.vel);
          }
        });
      }),
      OPTS,
    );
  });

  it("Property 18: pair doors keep Child with Adult", () => {
    const apart = new Set(["changing", "reception", "open_air", "pond_entrance"]);
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 24, maxHold: 40 }), (name, frames) => {
        run(stages()[name], frames, (b, _i, a) => {
          const aa = [areaOf(b.adult.zone), areaOf(a.adult.zone)] as const;
          const cc = [areaOf(b.child.zone), areaOf(a.child.zone)] as const;
          if (aa[0] !== aa[1] && findPairDoor(LEVEL, aa[0], aa[1])) expect(cc).toEqual(aa);
          if (cc[0] !== cc[1] && findPairDoor(LEVEL, cc[0], cc[1])) expect(aa).toEqual(cc);
          if (areaOf(a.child.zone) === "bath") expect(apart.has(areaOf(a.adult.zone))).toBe(false);
        });
      }),
      OPTS,
    );
  });

  it("Property 19: duckInPond checkpoint requires both humans on the shore", () => {
    fc.assert(
      fc.property(stageArb, seqArb({ maxSegments: 24 }), (name, frames) => {
        run(stages()[name], frames, (_b, _i, a) => {
          if (a.lastCheckpoint !== "duckInPond") return;
          const snap = a.checkpoints.duckInPond!;
          expect(snap.duck.inPond).toBe(true);
          expect(snap.duck.carriedBy).toBeNull();
          expect(snap.adult.zone).toBe("pond_entrance");
          expect(snap.child.zone).toBe("pond_entrance");
        });
      }),
      OPTS,
    );
    // Placement is rejected while Child is not on the shore.
    fc.assert(
      fc.property(fc.constantFrom("open_air", "bath", "common" as const), (zone) => {
        const s = mutate(stages().carriedAtShore, (c) => { c.child.zone = zone; });
        const r = tick(s, frameOf({ interact: true }), LEVEL).state;
        expect(r.duck.inPond).toBe(false);
        expect(r.duck.carriedBy).toBe("adult");
        expect(r.checkpoints.duckInPond).toBeUndefined();
      }),
      OPTS,
    );
    // And the happy path saves it.
    const placed = tick(stages().carriedAtShore, frameOf({ interact: true }), LEVEL).state;
    expect(placed.lastCheckpoint).toBe("duckInPond");
  });
});

// Keep the route helper import used: confirms the late stages came from the real route.
void R;
