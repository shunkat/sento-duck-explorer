// The guardian (Requirement 11.7): a scripted adult on checked dry spots
// outside the kids' corner, never in water, the corner or the women's
// entrance, never blocking the player.
import { describe, expect, it } from "vitest";
import type { GameState } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { circleOverlapsBox, distance } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import { inBathWater, zoneAt } from "../src/sim/zones";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const r = CHARACTER_RADIUS.adult;
const KIDS = new Set(["kids_pool", "kids_passage", "kids_room"]);

/** The guardian's body is safe: dry bath floor outside the kids' corner, clear of walls and water. */
function safe(s: GameState): string[] {
  const g = s.guardian.pos;
  const out: string[] = [];
  if (zoneAt(LEVEL, g) !== "bath") out.push(`zone ${zoneAt(LEVEL, g)}`);
  if (LEVEL.walls.some((w) => circleOverlapsBox(g, r, w))) out.push("overlaps a wall");
  if (inBathWater(LEVEL, g) || LEVEL.duckWater.some((w) => circleOverlapsBox(g, r, w))) out.push("in water");
  if (circleOverlapsBox(g, r, LEVEL.womensEntrance.step)) out.push("women's entrance");
  for (const z of LEVEL.zones) if (KIDS.has(z.id) && circleOverlapsBox(g, r, z.box)) out.push(`in ${z.id}`);
  return out;
}

describe("guardian", () => {
  it("every spot and every segment between neighbouring spots is safe for an adult body", () => {
    const path = LEVEL.guardianPath;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i]!;
      const b = path[i + 1]!;
      for (let t = 0; t <= 1; t += 0.02) {
        const g = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
        const s = { guardian: { pos: g, at: i } } as GameState;
        expect(safe(s), JSON.stringify(g)).toEqual([]);
      }
    }
  });

  it("follows the player's stage along the route: pool → room → rest, always safe", () => {
    const sim = new Sim();
    const seen = new Set<number>();
    const orig = sim.step.bind(sim);
    sim.step = (input) => {
      const ev = orig(input);
      expect(safe(sim.state)).toEqual([]);
      if (distance(sim.state.guardian.pos, LEVEL.guardianPath[sim.state.guardian.at]!) < 1e-6) seen.add(sim.state.guardian.at);
      return ev;
    };
    expect(sim.state.guardian.at).toBe(0);
    R.duckDrinksMilk1(sim);
    sim.walk([LEVEL.waypoints.passageSouth, LEVEL.waypoints.passageNorth]);
    sim.idle(150);
    expect(sim.state.guardian).toEqual({ pos: LEVEL.guardianPath[1], at: 1 });
    R.childDrinksMilk2(sim);
    sim.idle(150);
    expect(sim.state.guardian).toEqual({ pos: LEVEL.guardianPath[2], at: 2 });
    R.adultDriesAndDresses(sim);
    R.adultOpensFrontExit(sim);
    R.adultLeaves(sim);
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });

  it("never blocks the player: the guardian is not in any collision list", () => {
    const sim = new Sim();
    const g = sim.state.guardian.pos;
    for (const d of [{ kidsGate: "closed", frontExit: "closed" }, { kidsGate: "open", frontExit: "open" }] as const) {
      expect(wallsFor(LEVEL, d).some((w) => circleOverlapsBox(g, 0.01, w))).toBe(false);
    }
  });
});
