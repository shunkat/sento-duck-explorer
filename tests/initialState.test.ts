import { describe, expect, it } from "vitest";
import { createInitialState, toCore } from "../src/core/initialState";
import { LEVEL } from "../src/level/layout";

describe("initial state (Req 3.1, 5.1, 6.1, 6.2)", () => {
  const s = createInitialState(LEVEL);

  it("starts with Duck active and playing", () => {
    expect(s.active).toBe("duck");
    expect(s.outcome).toEqual({ kind: "playing" });
    expect(s.dialog).toBeNull();
    expect(s.tickCount).toBe(0);
  });

  it("places all three characters in the bathwater, wet; humans unclothed", () => {
    for (const c of [s.duck, s.child, s.adult]) {
      expect(c.zone).toBe("bathwater");
      expect(c.wet).toBe("wet");
    }
    expect(s.child.clothing).toBe("unclothed");
    expect(s.adult.clothing).toBe("unclothed");
    expect("clothing" in s.duck).toBe(false);
    expect(s.duck.carriedBy).toBeNull();
    expect(s.duck.inPond).toBe(false);
  });

  it("puts each item at its start node with status available", () => {
    expect(s.items.coin).toEqual({ owner: { kind: "node", id: "narrow_hole_coin" }, status: "available" });
    expect(s.items.key).toEqual({ owner: { kind: "node", id: "reception_desk" }, status: "available" });
    expect(s.items.hat).toEqual({ owner: { kind: "node", id: "sauna_hat_shelf" }, status: "available" });
    expect(s.saunaDoor).toBe("locked");
  });

  it("stores a start checkpoint equal to the core state, without nested snapshots", () => {
    expect(s.lastCheckpoint).toBe("start");
    expect(s.checkpoints.start).toEqual(toCore(s));
    expect("checkpoints" in s.checkpoints.start!).toBe(false);
  });

  it("returns independent copies", () => {
    const a = createInitialState(LEVEL);
    a.duck.pos.x = 99;
    expect(createInitialState(LEVEL).duck.pos.x).toBe(LEVEL.initialPositions.duck.x);
    expect(a.checkpoints.start!.duck.pos.x).toBe(LEVEL.initialPositions.duck.x);
  });
});
