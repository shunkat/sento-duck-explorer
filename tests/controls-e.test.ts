// E contracts on the one player (review R-2): drying, dressing and the towel,
// with F1/F2 around them. Direct states are labelled; everything else is input.
import { describe, expect, it } from "vitest";
import { atDryingSpot, DRYING_DOORS } from "../src/core/actions";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { REACH } from "../src/core/tuning";
import { EMPTY_INPUT, type GameState, type InputFrame, type Stage, type Vec2 } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import { zoneAt } from "../src/sim/zones";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const doorCenter = (id: string) => {
  const b = LEVEL.doors.find((d) => d.id === id)!.box;
  return { x: (b.minX + b.maxX) / 2, z: (b.minZ + b.maxZ) / 2 };
};

/** Direct state: a human player at `pos` with the given body state. */
function human(pos: Vec2, extra: Partial<GameState["player"]> = {}, stage: Stage = "adult"): GameState {
  const s = createInitialState(LEVEL);
  s.milk.milk1 = "collected";
  if (stage === "adult") s.milk.milk2 = "collected";
  Object.assign(s.player, { stage, pos, zone: zoneAt(LEVEL, pos)!, wet: "wet", clothing: "unclothed", towel: "held" }, extra);
  return s;
}
const step = (s: GameState, input: Partial<InputFrame>) => tick(s, { ...EMPTY_INPUT, ...input }, LEVEL);

describe("drying (E at a bath-side exit)", () => {
  it("dries only a wet human on the bath floor within reach of the changing-room or sauna door; the towel ends on the head", () => {
    for (const id of DRYING_DOORS) {
      const c = doorCenter(id);
      const at = id === "bath_changing" ? { x: c.x, z: c.z + 1.0 } : { x: c.x - 1.0, z: c.z };
      const r = step(human(at), { interact: true });
      expect(r.state.player, id).toMatchObject({ wet: "dry", towel: "head" });
    }
  });

  it("not too far away, not in the tub or the splash, not on the changing-room side, not as Duck", () => {
    const c = doorCenter("bath_changing");
    const far = human({ x: c.x + 0.2, z: c.z + REACH.dryAtExit + 0.3 });
    expect(atDryingSpot(far, LEVEL)).toBe(false);
    const splash = LEVEL.zones.find((z) => z.id === "splash")!.box;
    const inSplash = human({ x: (splash.minX + splash.maxX) / 2, z: (splash.minZ + splash.maxZ) / 2 });
    expect(inSplash.player.zone).toBe("splash");
    expect(atDryingSpot(inSplash, LEVEL)).toBe(false);
    const tub = human({ ...W.tubNorth, z: 5.8 });
    expect(tub.player.zone).toBe("bathwater");
    expect(atDryingSpot(tub, LEVEL)).toBe(false);
    const changing = human({ x: c.x, z: c.z - 0.6 });
    expect(changing.player.zone).toBe("changing");
    expect(atDryingSpot(changing, LEVEL)).toBe(false);
    const duck = createInitialState(LEVEL);
    expect(atDryingSpot(duck, LEVEL)).toBe(false);
  });

  it("a dry human at the drying spot only moves the towel (E's last choice)", () => {
    const c = doorCenter("bath_changing");
    const r = step(human({ x: c.x, z: c.z + 1.0 }, { wet: "dry", towel: "head" }), { interact: true });
    expect(r.state.player).toMatchObject({ wet: "dry", towel: "held" });
  });

  it("the towel on the head does not dry: walking into the changing room wet with the towel on the head is still F2", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    sim.walk([W.gateIn]);
    sim.press("interact");
    expect(sim.state.player.towel).toBe("head");
    sim.walk([W.gateOut, W.bathDoorDry, W.changingIn], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F2" });
  });
});

describe("dressing (E at the locker)", () => {
  const L = LEVEL.locker;

  it("only in the changing room within reach of the locker; flips clothing; never changes wetness", () => {
    const near = human({ x: L.x + 0.6, z: L.z }, { wet: "dry" });
    let r = step(near, { interact: true });
    expect(r.state.player).toMatchObject({ clothing: "clothed", wet: "dry" });
    r = step(r.state, { interact: true });
    expect(r.state.player).toMatchObject({ clothing: "unclothed", wet: "dry" });
    // A wet body in the changing room (state only): dressing does not dry it.
    const wet = step(human({ x: L.x + 0.6, z: L.z }), { interact: true });
    expect(wet.state.player).toMatchObject({ clothing: "clothed", wet: "wet" });
    // Too far from the locker: E moves the towel instead.
    const far = step(human({ x: L.x + REACH.locker + 0.4, z: L.z }, { wet: "dry" }), { interact: true });
    expect(far.state.player).toMatchObject({ clothing: "unclothed", towel: "head" });
  });

  it("Duck has no clothing action and no towel", () => {
    const r = step(createInitialState(LEVEL), { interact: true });
    expect(r.state.player).toMatchObject({ stage: "duck", clothing: "unclothed", towel: "none" });
  });
});

describe("towel and F1", () => {
  it("walking through water with a held towel is not F1; Q with it held in water is F1; Q with it on the head is a hint", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.press("interact"); // towel to the hand
    expect(sim.state.player.towel).toBe("held");
    sim.walk([{ x: 0.6, z: 8.0 }, { x: 1.8, z: 7.6 }, LEVEL.growthSpots.milk1]); // through the pool
    sim.expectPlaying();
    sim.press("interact"); // back on the head
    const ev = sim.press("dipTowel");
    expect(ev).toContainEqual({ kind: "prompt", text: "タオルは頭の上にあります（Eで手に持てます）" });
    sim.press("interact");
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
  });

  it("Q with a held towel on dry floor does nothing", () => {
    const r = step(human(W.bathMid), { dipTowel: true });
    expect(r.state.outcome).toEqual({ kind: "playing" });
  });
});
