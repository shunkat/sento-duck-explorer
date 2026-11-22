// Random-input properties for the one-player growth version (fast-check).
// From each checkpoint, random held directions and presses never break the
// state invariants, never reverse growth or return a bottle, never put Duck on
// the floor or the player inside a wall, and clear only as the Adult in the genkan.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT, type GameState, type InputFrame } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";
import { duckOnWater, playerClear, Sim } from "./helpers/sim";
import { checkInvariants } from "../src/core/invariants";

const STAGES = ["duck", "child", "adult"];

const frameArb: fc.Arbitrary<InputFrame> = fc.record({
  move: fc.oneof(fc.constant({ x: 0, z: 0 }), fc.double({ min: 0, max: 2 * Math.PI, noNaN: true }).map((a) => ({ x: Math.cos(a), z: Math.sin(a) }))),
  run: fc.boolean(),
  interact: fc.boolean(),
  dipTowel: fc.constant(false),
  shout: fc.constant(false),
  push: fc.constant(false),
  restart: fc.boolean(),
}).map((f) => ({ ...EMPTY_INPUT, ...f }));
const seqArb = fc.array(fc.tuple(frameArb, fc.integer({ min: 1, max: 40 })), { minLength: 1, maxLength: 25 });

function starts(): Record<string, GameState> {
  const a = new Sim();
  const b = new Sim();
  R.duckDrinksMilk1(b);
  const c = new Sim();
  R.duckDrinksMilk1(c);
  R.childDrinksMilk2(c);
  return { start: a.state, child: b.state, adult: c.state };
}
const STARTS = starts();

describe("properties", () => {
  it("invariants, one-way growth, Duck on water, no wall overlap, clear only as Adult in the genkan", () => {
    fc.assert(
      fc.property(fc.constantFrom("start", "child", "adult"), seqArb, (name, seq) => {
        let s = STARTS[name]!;
        for (const [frame, hold] of seq) {
          for (let i = 0; i < hold; i++) {
            const prev = s;
            s = tick(s, frame, LEVEL).state;
            expect([...checkInvariants(s), ...duckOnWater(s), ...playerClear(s)]).toEqual([]);
            if (s.outcome.kind === "cleared") expect([s.player.stage, s.player.zone]).toEqual(["adult", "street"]);
            // Growth never reverses, except a restart back to an earlier snapshot of the same run.
            if (!frame.restart) expect(STAGES.indexOf(s.player.stage)).toBeGreaterThanOrEqual(STAGES.indexOf(prev.player.stage));
          }
        }
      }),
      { numRuns: 60 },
    );
  });
});
