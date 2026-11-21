import { describe, expect, it } from "vitest";
import { interactHint, TRANSFER_ALLOWLIST } from "../src/core/actions";
import { createInitialState } from "../src/core/initialState";
import { decideOutcome, isCleared } from "../src/core/rules";
import { MSG } from "../src/core/text";
import { REACH } from "../src/core/tuning";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";

const W = LEVEL.waypoints;
import { Sim } from "./helpers/sim";

describe("transfer allowlist and hat equip (Req 3.3, 3.5, 3.9, 5.2, 5.8, 5.9)", () => {
  it("allows exactly Coin duck→adult and Key adult→child", () => {
    expect(TRANSFER_ALLOWLIST).toEqual([
      { item: "coin", from: "duck", to: "adult" },
      { item: "key", from: "adult", to: "child" },
    ]);
  });

  it("Duck cannot give the coin to Child", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    sim.walk([W.troughEnd]); // trough end, next to Child at the entrance
    expect(Math.hypot(sim.pos().x - sim.pos("child").x, sim.pos().z - sim.pos("child").z)).toBeLessThan(REACH.give);
    expect(Math.hypot(sim.pos().x - sim.pos("adult").x, sim.pos().z - sim.pos("adult").z)).toBeGreaterThan(REACH.give);
    sim.press("interact");
    expect(sim.state.dialog).toBeNull();
    expect(sim.owner("coin")).toBe("character:duck");
  });

  it("cancelling the dialog keeps the owner", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    sim.walk([W.troughEnd]);
    sim.switchTo("adult");
    sim.walk([W.troughGive]);
    sim.switchTo("duck");
    sim.press("interact");
    expect(sim.state.dialog).not.toBeNull();
    sim.press("switchCharacter"); // blocked while the dialog is open (Req 1.5)
    expect(sim.active).toBe("duck");
    sim.press("cancel");
    expect(sim.state.dialog).toBeNull();
    expect(sim.owner("coin")).toBe("character:duck");
  });

  it("Child holding the hat near Adult cannot hand it over; only Equip on Duck moves it", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    R.duckGivesCoin(sim);
    R.adultPaysWithChild(sim);
    R.adultGivesKey(sim);
    R.childUnlocksSauna(sim);
    R.childEntersSauna(sim);
    R.childGetsHat(sim);
    R.childLeavesSauna(sim);
    // Child is next to Adult and far from Duck.
    sim.approach(sim.pos("adult"), 0.8);
    expect(Math.hypot(sim.pos().x - sim.pos("duck").x, sim.pos().z - sim.pos("duck").z)).toBeGreaterThan(REACH.equip);
    sim.press("interact");
    expect(sim.state.dialog).toBeNull();
    expect(sim.owner("hat")).toBe("character:child");
    R.childEquipsHat(sim);
  });
});

describe("carrying Duck (Req 2.5, 2.6, 3.10)", () => {
  it("only Adult can pick up Duck; a second interact puts Duck down", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.press("interact"); // Child next to Duck again
    expect(sim.state.duck.carriedBy).toBeNull();

    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("adult");
    sim.walk([W.tubWest, W.bathMid]);
    expect(sim.pos("duck")).toEqual(sim.pos("adult"));

    // On the floor of the aisle, far from the water: E is refused and Duck stays held.
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBe("adult");
    expect(sim.lastEvents).toContainEqual({ kind: "rejected", reason: MSG.cannotPutDuckHere });

    // Next to the tub: Duck goes onto the water, not the floor.
    sim.walk([W.tubNorth]);
    sim.press("interact");
    expect(sim.state.duck.carriedBy).toBeNull();
    expect(sim.state.duck.zone).toBe("bathwater");
    sim.switchTo("duck");
    const before = sim.pos("duck");
    sim.step({ move: { x: -1, z: 0 } });
    expect(sim.pos("duck").x).toBeLessThan(before.x);
  });

  it("Adult carrying Duck cannot leave the bath without Child", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), REACH.pickUpDuck);
    sim.press("interact");
    sim.walk([W.tubWest, W.tubNorth, W.eastAisle, W.openAirDoorBath]);
    for (let i = 0; i < 40; i++) sim.step({ move: { x: 1, z: 0 } });
    expect(sim.state.adult.zone).toBe("bath");
    expect(sim.lastEvents).toContainEqual({ kind: "prompt", text: MSG.moveTogether("child") });
  });
});

describe("drying with E (Req 6.4, 6.6, 6.7)", () => {
  it("not in the bathwater; at the exit E dries; Duck on the water is not dried (it stays wet)", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 9.8, z: 6.2 }]); // in the bathwater, away from Duck
    sim.press("interact"); // towel toggle, not drying
    expect(sim.state.child.wet).toBe("wet");
    sim.switchTo("duck");
    sim.walk([{ x: 4.8, z: 5.6 }]); // Duck stays on the water, at the tub's corner
    sim.switchTo("child");
    sim.walk([W.tubNorth, W.bathAisle, W.bathDoorDry]);
    sim.press("interact");
    expect(sim.state.child.wet).toBe("dry");
    expect(sim.state.child.clothing).toBe("unclothed");
    sim.walk([{ x: 4.3, z: 5.2 }]); // on the floor beside the tub
    expect(interactHint(sim.state, LEVEL)).toBe("アヒルを抱える"); // no "dry the Duck" any more
    expect(sim.state.duck.wet).toBe("wet"); // Duck lives on the water
  });
});

describe("pond: switch tick vs. next tick (Req 1.7, 1.8, 8.5)", () => {
  function inPond(): Sim {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    R.adultCarriesDuckToPond(sim);
    return sim;
  }

  it("the switch tick does not move Duck, and an inactive Duck stays frozen", () => {
    const sim = inPond();
    for (let i = 0; i < 30; i++) sim.step({ move: { x: 0, z: 1 } }); // build up velocity
    const pos = { ...sim.state.duck.pos };
    const vel = { ...sim.state.duck.vel };
    expect(Math.hypot(vel.x, vel.z)).toBeGreaterThan(0.1);

    sim.press("switchCharacter"); // the switch tick itself
    expect(sim.active).toBe("child");
    expect(sim.state.duck.pos).toEqual(pos);
    expect(sim.state.duck.vel).toEqual(vel);

    sim.idle(30); // later ticks with another character active
    for (let i = 0; i < 10; i++) sim.step({ move: { x: -1, z: 0 } });
    expect(sim.state.duck.pos).toEqual(pos);
    expect(sim.state.duck.vel).toEqual(vel);

    sim.switchTo("duck"); // two switch ticks
    expect(sim.state.duck.pos).toEqual(pos);

    sim.idle(1); // first tick after switching back: physics resumes
    expect(sim.state.duck.pos).not.toEqual(pos);
  });

  it("with no input, the current carries Duck toward the goal side", () => {
    const sim = inPond();
    const x0 = sim.state.duck.pos.x;
    sim.idle(30);
    expect(sim.state.duck.pos.x).toBeGreaterThan(x0);
  });
});

describe("outcome rules (Req 3.13–3.15, 7.9)", () => {
  it("game over wins over clear in the same tick", () => {
    expect(decideOutcome(["F6"], true)).toEqual({ kind: "gameOver", reason: "F6" });
    expect(decideOutcome(["F7", "F2"], false)).toEqual({ kind: "gameOver", reason: "F2" });
    expect(decideOutcome([], true)).toEqual({ kind: "cleared" });
  });

  it("clear needs the hat equipped on Duck, and Duck itself in the goal", () => {
    const base = createInitialState(LEVEL);
    const inGoal = {
      ...base,
      duck: { ...base.duck, zone: "pond_goal" as const, inPond: true },
    };
    expect(isCleared(inGoal)).toBe(false); // no hat
    expect(
      isCleared({ ...inGoal, items: { ...inGoal.items, hat: { owner: { kind: "character", id: "duck" }, status: "equipped" } } }),
    ).toBe(true);
    const humansInGoal = {
      ...base,
      child: { ...base.child, zone: "pond_goal" as const },
      adult: { ...base.adult, zone: "pond_goal" as const },
      items: { ...base.items, hat: { owner: { kind: "character" as const, id: "duck" as const }, status: "equipped" as const } },
    };
    expect(isCleared(humansInGoal)).toBe(false);
  });
});
