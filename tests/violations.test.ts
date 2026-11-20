import { describe, expect, it } from "vitest";
import { MSG } from "../src/core/text";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

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
    sim.walk([{ x: 3.6, z: 1.6 }]);
    sim.press("dipTowel");
    sim.expectPlaying();
  });
});

describe("F2: entering the changing room wet (Req 4.1, 4.2, 7.2)", () => {
  it("the active human entering wet ends the game", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([{ x: 3.2, z: 1.2 }]);
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }, { x: 2.6, z: -1 }], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F2" });
  });

  it("a wet companion blocks the crossing without a game over", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([{ x: 3.2, z: 1.2 }]); // still wet
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    sim.press("dry");
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.child.zone).toBe("bath");
    expect(prompts(sim)).toContain(MSG.companionDry("adult"));
  });

  it("a companion farther than the join radius blocks the crossing", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    sim.press("dry");
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.child.zone).toBe("bath");
    expect(prompts(sim)).toContain(MSG.moveTogether("adult"));
  });
});

describe("F3: running onto soap (Req 7.3)", () => {
  it("running over the soap ends the game; walking does not", () => {
    const walkSim = new Sim();
    walkSim.switchTo("adult");
    walkSim.walk([{ x: 10.5, z: 5 }, { x: 13.5, z: 5 }]);
    walkSim.expectPlaying();

    const runSim = new Sim();
    runSim.switchTo("adult");
    runSim.walk([{ x: 10.5, z: 5 }]);
    runSim.walk([{ x: 13.5, z: 5 }], { run: true, allowEnd: true });
    expect(runSim.state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
  });
});

describe("F4: leaving the changing room unclothed (Req 4.4, 7.4)", () => {
  it("going to reception unclothed ends the game", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.switchTo("child");
    sim.walk([{ x: 3.2, z: -3.0 }]);
    sim.switchTo("adult");
    sim.walk([{ x: 2.6, z: -3.2 }, { x: 2.6, z: -5 }], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F4" });
  });

  it("an unclothed companion blocks the crossing without a game over", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.walk([{ x: 5.4, z: -2 }]);
    sim.press("toggleClothes");
    expect(sim.state.adult.clothing).toBe("clothed");
    sim.switchTo("child");
    sim.walk([{ x: 3.2, z: -3.0 }]);
    sim.switchTo("adult");
    sim.walk([{ x: 2.6, z: -3.2 }]);
    hold(sim, { x: 0, z: -1 }, 40);
    sim.expectPlaying();
    expect(sim.state.adult.zone).toBe("changing");
    expect(prompts(sim)).toContain(MSG.companionDress("child"));
  });

  it("going from the changing room back to the bath unclothed is fine", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.walk([{ x: 2.6, z: 1.5 }]);
    sim.expectPlaying();
    expect(sim.state.adult.zone).toBe("bath");
  });

  it("paying without the coin is rejected", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    R.pairToggleClothes(sim, { x: 3.2, z: -3.0 });
    sim.switchTo("adult");
    sim.walk([{ x: 2.6, z: -3.2 }, { x: 2.6, z: -5 }, { x: 3, z: -6.3 }]);
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
    sim.walk([{ x: 1.2, z: 2.5 }, { x: 1.0, z: 7.2 }]); // Adult waits, dry
    sim.switchTo("child");
    sim.walk([{ x: 4, z: 4 }]); // into the bathwater
    expect(sim.state.child.wet).toBe("wet");
    sim.walk([{ x: 2.0, z: 7.5 }]);
    sim.press("interact");
    sim.walk([{ x: 2.6, z: 7.6 }, { x: 2.6, z: 9.0 }], { allowEnd: true });
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
    sim.walk([{ x: 4, z: 4 }, { x: 1.0, z: 7.2 }]); // Adult gets wet on the way
    expect(sim.state.adult.wet).toBe("wet");
    sim.switchTo("child");
    sim.walk([{ x: 1.2, z: 2.5 }, { x: 2.0, z: 7.5 }]);
    sim.press("interact");
    sim.walk([{ x: 2.6, z: 7.6 }]);
    hold(sim, { x: 0, z: 1 }, 40);
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
    sim.walk([{ x: 6.8, z: 10 }]);
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
    sim.walk([{ x: 2.6, z: 8.6 }, { x: 2.6, z: 7.3 }]);
    expect(sim.state.child.wet).toBe("wet");
    expect(sim.state.adult.wet).toBe("wet");
  });
});
