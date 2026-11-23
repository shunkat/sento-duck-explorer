import { describe, expect, it } from "vitest";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT } from "../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../src/level/layout";
import { moveCircle } from "../src/sim/collision";
import { box, circleOverlapsBox } from "../src/sim/geometry";
import { wallsFor } from "../src/sim/movement";
import * as R from "./helpers/route";
import { playerClear, Sim } from "./helpers/sim";

describe("circle collision at adjoining surfaces", () => {
  it("keeps the adult clear through the shrunk seed 594332710 storage-corner run", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    let state = sim.state;
    const frame = { ...EMPTY_INPUT, move: { x: -0.21404178347364414, z: 0.9768245056955838 }, run: true };
    for (let i = 0; i < 32; i++) {
      state = tick(state, frame, LEVEL).state;
      expect(playerClear(state), `held-input tick ${i + 1}`).toEqual([]);
      expect(wallsFor(LEVEL, state.doors).some(w =>
        circleOverlapsBox(state.player.pos, CHARACTER_RADIUS.adult, w))).toBe(false);
    }
  });

  it.each([false, true])("does not enter an undersized gap when wall order is reversed: %s", reversed => {
    const walls = [box(-0.1, 0, 0.1, 8.3), box(0.7, 4.5, 2.3, 6.7)];
    if (reversed) walls.reverse();
    let adult = { x: 0.46, z: 4 };
    for (let i = 0; i < 120; i++) {
      adult = moveCircle(adult, { x: -0.01, z: 0.075 }, CHARACTER_RADIUS.adult, walls);
      expect(walls.some(w => circleOverlapsBox(adult, CHARACTER_RADIUS.adult, w))).toBe(false);
    }
    expect(adult.z).toBeLessThan(4.5);
    // Blocking the undersized entrance must not trap the player: reversing
    // away from the corner immediately restores normal movement.
    const stopped = adult;
    adult = moveCircle(adult, { x: 0.05, z: -0.05 }, CHARACTER_RADIUS.adult, walls);
    expect(adult.x).toBeGreaterThan(stopped.x);
    expect(adult.z).toBeLessThan(stopped.z);
    expect(walls.some(w => circleOverlapsBox(adult, CHARACTER_RADIUS.adult, w))).toBe(false);
    // The same 0.60 m gap must still accept the 0.50 m child body.
    let child = { x: 0.4, z: 4 };
    for (let i = 0; i < 40; i++) {
      child = moveCircle(child, { x: 0, z: 0.05 }, CHARACTER_RADIUS.child, walls);
      expect(walls.some(w => circleOverlapsBox(child, CHARACTER_RADIUS.child, w))).toBe(false);
    }
    expect(child.z).toBeCloseTo(6, 8);
  });

  it("slides along a blocking wall while preserving free movement", () => {
    const walls = [box(-0.1, -5, 0.1, 5)];
    let position = { x: 0.6, z: 0 };
    for (let i = 0; i < 20; i++) {
      position = moveCircle(position, { x: -0.05, z: 0.05 }, CHARACTER_RADIUS.adult, walls);
      expect(circleOverlapsBox(position, CHARACTER_RADIUS.adult, walls[0]!)).toBe(false);
    }
    expect(position.x).toBeCloseTo(0.45, 5);
    expect(position.z).toBeCloseTo(1, 8);
    expect(moveCircle({ x: 1, z: 2 }, { x: 0.1, z: -0.05 }, CHARACTER_RADIUS.adult, []))
      .toEqual({ x: 1.1, z: 1.95 });
  });
});
