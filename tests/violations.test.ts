import { describe, expect, it } from "vitest";
import { MSG } from "../src/core/text";
import { LEVEL } from "../src/level/layout";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const L = LEVEL.locker;
const prompts = (sim: Sim) => sim.lastEvents.filter((e) => e.kind === "prompt").map((e) => (e as { text: string }).text);

/** Hold a direction for n ticks (used where the move is expected to be blocked). */
function hold(sim: Sim, dir: { x: number; z: number }, n: number) {
  for (let i = 0; i < n; i++) sim.step({ move: dir });
}

describe("F1: towel in the bathwater (Req 7.1)", () => {
  it("dipping the towel in the bathwater ends the game", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
  });

  it("outside the bathwater, or as Duck, nothing happens", () => {
    const sim = new Sim();
    sim.press("dipTowel"); // Duck has no towel
    sim.expectPlaying();
    sim.switchTo("child");
    sim.walk([W.tubWest, W.bathAisle, W.bathDoorDry]);
    sim.press("dipTowel");
    sim.expectPlaying();
  });
});

describe("F2: entering the changing room wet (Req 4.1, 4.2, 7.2)", () => {
  it("the active human entering wet ends the game", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([W.tubWest, W.bathAisle, { x: 2.4, z: 2.0 }]);
    sim.switchTo("child");
    sim.walk([W.tubWest, W.bathAisle, W.bathDoorDry, W.changingIn], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F2" });
  });

  it("a wet companion blocks the crossing without a game over", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([W.tubWest, W.bathAisle, { x: 2.4, z: 2.0 }]); // still wet
    sim.switchTo("child");
    sim.walk([W.tubWest, W.bathAisle, W.bathDoorDry]);
    sim.press("interact");
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.child.zone).toBe("bath");
    expect(prompts(sim)).toContain(MSG.companionDry("adult"));
  });

  it("a companion farther than the join radius blocks the crossing", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([W.tubWest, W.bathAisle, W.bathDoorDry, { x: 1.4, z: 1.0 }]);
    sim.press("interact");
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.child.zone).toBe("bath");
    expect(prompts(sim)).toContain(MSG.moveTogether("adult"));
  });
});

describe("F3: running onto soap (Req 7.3)", () => {
  it("running over the soap ends the game; walking does not", () => {
    const soap = LEVEL.soaps[0]!.pos;
    const walkSim = new Sim();
    walkSim.switchTo("adult");
    walkSim.walk([{ x: soap.x, z: soap.z + 1.4 }, { x: soap.x, z: soap.z + 0.1 }]);
    walkSim.expectPlaying();

    const runSim = new Sim();
    R.adultRunsOverSoap(runSim);
    expect(runSim.state.outcome).toEqual({ kind: "gameOver", reason: "F3" });

    // The aisle past the stools is wide: running along it never touches the soap.
    const aisle = new Sim();
    aisle.switchTo("adult");
    aisle.walk([W.tubNorth, W.bathAisle]);
    aisle.walk([{ x: 9.8, z: 2.4 }, { x: 4.4, z: 2.4 }], { run: true });
    aisle.expectPlaying();
  });
});

describe("F4: leaving the changing room unclothed (Req 4.4, 7.4)", () => {
  it("going to reception unclothed ends the game", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.switchTo("child");
    sim.walk([W.lockerAisle, W.screenPassage, W.screenWait]);
    sim.switchTo("adult");
    sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F4" });
  });

  it("an unclothed companion blocks the crossing without a game over", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.walk([{ x: L.x + 0.3, z: L.z }]);
    sim.press("interact");
    expect(sim.state.adult.clothing).toBe("clothed");
    sim.switchTo("child");
    sim.walk([W.lockerAisle, W.screenPassage, W.screenWait]);
    sim.switchTo("adult");
    sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn]);
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.adult.zone).toBe("changing");
    expect(prompts(sim)).toContain(MSG.companionDress("child"));
  });

  it("going from the changing room back to the bath unclothed is fine", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.walk([W.bathDoorDry]);
    sim.expectPlaying();
    expect(sim.state.adult.zone).toBe("bath");
  });

  it("paying without the coin is rejected", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    R.pairToggleClothes(sim, W.lockerAisle);
    sim.walk([W.screenPassage, W.screenWait]);
    sim.switchTo("adult");
    sim.walk([W.lockerAisle, W.screenPassage, W.receptionDoorIn, W.receptionIn, W.deskFront]);
    sim.press("interact");
    expect(sim.lastEvents).toContainEqual({ kind: "rejected", reason: MSG.needCoin });
    expect(sim.owner("key")).toBe("node:reception_desk");
  });
});

/** Up to Child holding the key, with Adult waiting by the sauna door. */
function readyForSauna(): Sim {
  const sim = new Sim();
  R.duckGetsCoin(sim);
  R.duckGivesCoin(sim);
  R.adultPaysWithChild(sim);
  R.adultGivesKey(sim);
  return sim;
}

describe("F5: entering the sauna wet, and restore from paidReturned (Req 7.5, 10.4)", () => {
  it("a wet child entering the sauna ends the game; restart restores paidReturned", () => {
    const sim = readyForSauna();
    R.walkDryToSaunaDoor(sim, W.saunaWait); // Adult waits, dry
    sim.switchTo("child");
    R.walkDryToSaunaDoor(sim, W.saunaDoorDry);
    sim.press("interact"); // dry Child: E unlocks (drying applies only when wet)
    expect(sim.state.saunaDoor).toBe("unlocked");
    sim.walk([W.bathMid, W.tubNorth, { x: 9.8, z: 5.8 }]); // into the tub
    expect(sim.state.child.wet).toBe("wet");
    sim.walk([W.tubNorth, W.bathMid, W.saunaDoorDry, W.saunaIn], { allowEnd: true }); // walking in wet, no E
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F5" });

    sim.press("restart");
    sim.expectPlaying();
    expect(sim.state.lastCheckpoint).toBe("paidReturned");
    // Paid coin and the key with Adult come back together; the door is locked again.
    expect(sim.state.items.coin.status).toBe("paid");
    expect(sim.owner("key")).toBe("character:adult");
    expect(sim.state.saunaDoor).toBe("locked");
    expect(sim.state.adult.zone).toBe("bath");
    expect(sim.state.child.zone).toBe("bath");
    expect(sim.state.child.wet).toBe("dry");
    sim.idle(5);
    sim.expectPlaying();
  });

  it("a wet companion blocks entering the sauna", () => {
    const sim = readyForSauna();
    sim.walk([W.bathAisle, W.tubNorth, { x: 9.8, z: 5.8 }, W.tubNorth, W.bathMid, W.saunaWait]); // Adult gets wet in the tub
    expect(sim.state.adult.wet).toBe("wet");
    sim.switchTo("child");
    R.walkDryToSaunaDoor(sim, W.saunaDoorDry);
    sim.press("interact");
    hold(sim, { x: 1, z: 0 }, 40);
    sim.expectPlaying();
    expect(sim.state.child.zone).toBe("bath");
    expect(prompts(sim)).toContain(MSG.companionDry("adult"));
  });
});

/** In the sauna entry with Adult. */
function inSauna(): Sim {
  const sim = readyForSauna();
  R.childUnlocksSauna(sim);
  R.childEntersSauna(sim);
  return sim;
}

describe("F6 and F7 in the sauna (Req 7.6–7.8)", () => {
  it("shouting in the sauna ends the game", () => {
    const sim = inSauna();
    sim.press("shout");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F6" });
  });

  it("shouting outside the sauna only shows a prompt", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.press("shout");
    sim.expectPlaying();
  });

  it("pushing next to the crowd ends the game", () => {
    const sim = inSauna();
    const g = LEVEL.crowdGaps[0]!.box;
    sim.walk([{ x: g.minX - 0.4, z: (g.minZ + g.maxZ) / 2 }]);
    sim.press("push");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F7" });
  });

  it("pushing far from anyone, or walking through the gaps, does not", () => {
    const sim = inSauna();
    sim.press("push");
    sim.expectPlaying();
    R.childGetsHat(sim); // weaves through all three gaps
    R.childLeavesSauna(sim);
    sim.expectPlaying();
  });

  it("leaving the sauna makes both humans sweaty (wet)", () => {
    const sim = inSauna();
    sim.walk([W.saunaIn, W.saunaDoorDry]);
    expect(sim.state.child.wet).toBe("wet");
    expect(sim.state.adult.wet).toBe("wet");
  });
});
