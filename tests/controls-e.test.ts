// Simplified controls (2026-11-20 user request): T and G are gone; E does
// drying at the bath exits, dressing at the locker, and the towel head/hand
// toggle. Every check here drives the game through input only.
import { describe, expect, it } from "vitest";
import { interactHint } from "../src/core/actions";
import { nearbyHints, objective } from "../src/core/guide";
import { MSG } from "../src/core/text";
import { DT } from "../src/core/tuning";
import { EMPTY_INPUT, type GameState, type InputFrame } from "../src/core/types";
import { HANDLED_KEYS, KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance } from "../src/loop";
import { deriveView } from "../src/view/deriveView";
import { KEY_HELP } from "../src/view/hud";
import { HEAD_TOP_TOLERANCE, headAnchor, TOWEL_DEPTH, towelPose } from "../src/view/humanModel";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

/** Press E like the game does, and check the HUD named exactly what happened. */
function pressE(sim: Sim): string | null {
  const hint = interactHint(sim.state, LEVEL);
  sim.press("interact");
  return hint;
}

describe("keyboard wiring: T and G are inert, E is the action key", () => {
  it("KeyT and KeyG produce an empty frame; KeyE produces interact", () => {
    const kb = new KeyboardState();
    for (const code of ["KeyT", "KeyG"]) {
      kb.keyDown(code);
      expect(kb.takeFrame(false)).toEqual(EMPTY_INPUT);
      kb.keyUp(code);
      expect(HANDLED_KEYS.has(code)).toBe(false);
    }
    kb.keyDown("KeyE");
    expect(kb.takeFrame(false).interact).toBe(true);
  });

  it("through KeyboardState → advance: E at the exit dries the Child; T and G change nothing", () => {
    const kb = new KeyboardState();
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 3.6, z: 1.6 }]);
    let s: GameState = sim.state;
    const tap = (code: string) => {
      kb.keyDown(code);
      s = advance(s, 0, DT, (st) => kb.takeFrame(st.dialog !== null), LEVEL).state;
      kb.keyUp(code);
    };
    const before = structuredClone(s.child);
    tap("KeyT");
    tap("KeyG");
    expect(s.child).toEqual(before);
    tap("KeyE");
    expect(s.child.wet).toBe("dry");
    expect(s.child.towel).toBe("head");
    expect(s.child.pos).toEqual(before.pos); // E never moves the character
  });

  it("help, README-facing key list and HUD hints never mention T or G", () => {
    expect(KEY_HELP.join("\n")).not.toMatch(/(^|[^A-Z])[TG]：/m);
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 3.6, z: 1.6 }]);
    for (const h of nearbyHints(sim.state, LEVEL)) expect(h).not.toMatch(/^[TG]:/);
  });
});

describe("E at the bath exits dries the controlled wet human", () => {
  it("inside the spot near the changing-room door: dries itself only, towel goes on the head", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    expect(pressE(sim)).toBe("タオルで体を拭く");
    expect(sim.state.child.wet).toBe("dry");
    expect(sim.state.child.towel).toBe("head");
    expect(sim.state.adult.wet).toBe("wet"); // only the controlled character
  });

  it("not in the tub, not far away, not on the changing-room side", () => {
    const tub = new Sim();
    tub.switchTo("adult"); // starts in the bathwater
    expect(pressE(tub)).toBe("タオルを頭にのせる");
    expect(tub.state.adult.wet).toBe("wet");

    const far = new Sim();
    far.switchTo("adult");
    far.walk([{ x: 5.4, z: 2.4 }, { x: 9, z: 1.5 }]); // bath floor, 6 m from the door
    expect(far.state.adult.zone).toBe("bath");
    expect(pressE(far)).not.toBe("タオルで体を拭く");
    expect(far.state.adult.wet).toBe("wet");

    const side = new Sim();
    R.pairToChanging(side);
    side.switchTo("child");
    side.walk([{ x: 3.4, z: -0.6 }]); // just through the door: changing room
    expect(side.state.child.zone).toBe("changing");
    expect(interactHint(side.state, LEVEL)).not.toBe("タオルで体を拭く");
  });

  it("already dry at the spot: E falls through to the next action (towel)", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    pressE(sim);
    expect(pressE(sim)).toBe("タオルを手に持つ");
    expect(sim.state.child.towel).toBe("held");
    expect(sim.state.child.wet).toBe("dry");
  });

  it("before the sauna door: a dry Child with the key unlocks; a wet one dries first, then unlocks", () => {
    const dry = readyForSauna();
    dry.switchTo("child");
    R.walkDryToSaunaDoor(dry, { x: 2.0, z: 7.5 });
    expect(dry.state.child.wet).toBe("dry");
    expect(pressE(dry)).toBe("サウナ室の扉を鍵で開ける");
    expect(dry.state.saunaDoor).toBe("unlocked");

    const wet = readyForSauna();
    wet.switchTo("child");
    wet.walk([{ x: 4, z: 6.5 }, { x: 2.0, z: 7.5 }]); // through the bathwater
    expect(wet.state.child.wet).toBe("wet");
    expect(pressE(wet)).toBe("タオルで体を拭く");
    expect(wet.state.saunaDoor).toBe("locked");
    expect(pressE(wet)).toBe("サウナ室の扉を鍵で開ける");
    expect(wet.state.saunaDoor).toBe("unlocked");
  });

  it("the towel toggle never takes the key handoff", () => {
    const sim = new Sim();
    R.duckGetsCoin(sim);
    R.duckGivesCoin(sim);
    R.adultPaysWithChild(sim);
    sim.switchTo("adult");
    sim.approach(sim.pos("child"), 1.0);
    expect(pressE(sim)).toBe("子どもに鍵を渡す");
    expect(sim.state.dialog).toEqual({ item: "key", from: "adult", to: "child" });
  });

  it("both humans wet: the HUD names who still needs drying", () => {
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]);
    sim.switchTo("adult");
    sim.walk([{ x: 3.4, z: 2.4 }, { x: 3.6, z: 1.6 }]);
    expect(nearbyHints(sim.state, LEVEL)).toContain("子どもも濡れています（Tabで切り替えて出口の前でE）");
    pressE(sim);
    sim.switchTo("child");
    expect(nearbyHints(sim.state, LEVEL)[0]).toBe("E: タオルで体を拭く");
  });

  it("walking through wet still triggers F2 (towel on the head does not dry)", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([{ x: 3.4, z: 2.4 }, { x: 3.6, z: 1.6 }]);
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.6 }]);
    pressE(sim); // child dries
    sim.switchTo("adult");
    sim.walk([{ x: 9, z: 1.5 }]); // away from the spot: E only moves the towel
    pressE(sim);
    expect(sim.state.adult.towel).toBe("head");
    expect(sim.state.adult.wet).toBe("wet");
    // Walk the wet Adult back next to the Child and through the door without pressing E.
    sim.walk([{ x: 3.2, z: 1.0 }, { x: 2.6, z: -1 }], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F2" });
  });
});

describe("E at the locker dresses and undresses", () => {
  it("dressing keeps wetness; leaving unclothed is still F4", () => {
    const sim = new Sim();
    R.pairToChanging(sim);
    sim.switchTo("adult");
    sim.walk([{ x: 5.4, z: -2 }]);
    expect(pressE(sim)).toBe("服を着る");
    expect(sim.state.adult.clothing).toBe("clothed");
    expect(sim.state.adult.wet).toBe("dry");
    expect(pressE(sim)).toBe("服を脱ぐ");
    expect(sim.state.adult.clothing).toBe("unclothed");
    sim.switchTo("child");
    sim.walk([{ x: 3.2, z: -3.0 }]);
    sim.switchTo("adult");
    sim.walk([{ x: 2.6, z: -3.2 }, { x: 2.6, z: -5 }], { allowEnd: true });
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F4" });
  });
});

describe("towel on the head or in the hand", () => {
  it("starts held; on the head Q does not dip it (hint); back in the hand Q is F1", () => {
    const sim = new Sim();
    sim.switchTo("child"); // in the bathwater
    expect(sim.state.child.towel).toBe("held");
    pressE(sim);
    expect(sim.state.child.towel).toBe("head");
    expect(nearbyHints(sim.state, LEVEL)).toContain("タオルは頭の上（Qでは湯につきません）");
    sim.press("dipTowel");
    sim.expectPlaying();
    expect(sim.lastEvents).toContainEqual({ kind: "prompt", text: MSG.towelOnHead });
    pressE(sim);
    expect(sim.state.child.towel).toBe("held");
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
  });

  it("walking through the water with the towel in hand is not F1", () => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([{ x: 6.5, z: 6.5 }, { x: 2.5, z: 3.5 }, { x: 6.5, z: 4 }]);
    sim.expectPlaying();
  });

  it("drying with the towel on the head keeps it there; from the hand it is stowed on the head", () => {
    const head = new Sim();
    head.switchTo("child");
    pressE(head); // to the head while in the tub
    head.walk([{ x: 2.6, z: 1.0 }]);
    pressE(head);
    expect(head.state.child).toMatchObject({ wet: "dry", towel: "head" });

    const hand = new Sim();
    hand.switchTo("child");
    hand.walk([{ x: 2.6, z: 1.0 }]);
    expect(hand.state.child.towel).toBe("held");
    pressE(hand);
    expect(hand.state.child).toMatchObject({ wet: "dry", towel: "head" });
  });

  it("Duck never has a towel and never wears one", () => {
    const sim = new Sim();
    expect("towel" in sim.state.duck).toBe(false);
    for (let i = 0; i < 3; i++) {
      const hint = pressE(sim);
      expect(hint === null || !hint.includes("タオル")).toBe(true);
    }
    expect("towel" in sim.state.duck).toBe(false);
    expect(deriveView(sim.state, LEVEL).characters.duck.towel).toBeUndefined();
  });

  it("checkpoint restore brings the saved towel place back", () => {
    const sim = readyForSauna();
    expect(sim.state.lastCheckpoint).toBe("paidReturned");
    const saved = sim.state.checkpoints.paidReturned!;
    expect(saved.child.towel).toBe("head"); // stowed when the Child dried
    sim.switchTo("child");
    sim.walk([{ x: 4, z: 4.5 }]); // into the bathwater
    pressE(sim); // towel to the hand
    expect(sim.state.child.towel).toBe("held");
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
    sim.press("restart");
    expect(sim.state.child.towel).toBe(saved.child.towel);
    expect(sim.state.adult.towel).toBe(saved.adult.towel);
  });

  it("view: towel on the head above the body top, in the hand at the hand socket", () => {
    const body = { height: 1.2, radius: 0.25 };
    expect(towelPose("head", body).y).toBeGreaterThan(0.6);
    const hand = { x: -0.2, y: 0.05, z: 0.1 };
    const p = towelPose("held", { ...body, hand });
    expect([p.x, p.z]).toEqual([hand.x, hand.z]);
    expect(p.y).toBeLessThan(hand.y);
    const sim = new Sim();
    const v = deriveView(sim.state, LEVEL);
    expect([v.characters.child.towel, v.characters.adult.towel]).toEqual(["held", "held"]);
  });
});

describe("E-only clear route", () => {
  it("the 10-step route clears using only move, switch, E and confirm", () => {
    const used = new Set<string>();
    const sim = new Sim();
    const step = sim.step.bind(sim);
    sim.step = (input: Partial<InputFrame> = {}) => {
      for (const [k, v] of Object.entries(input)) if (v === true) used.add(k);
      return step(input);
    };
    R.playUntilHatEquipped(sim);
    R.adultCarriesDuckToPond(sim);
    R.duckSwimsToGoal(sim);
    expect([...used].sort()).toEqual(["confirm", "interact", "switchCharacter"]);
  });
});

function readyForSauna(): Sim {
  const sim = new Sim();
  R.duckGetsCoin(sim);
  R.duckGivesCoin(sim);
  R.adultPaysWithChild(sim);
  R.adultGivesKey(sim);
  return sim;
}

describe("sauna objective follows the state (review P2)", () => {
  it("names who is wet; both dry + locked → Child unlocks with E; unlocked → go in together", () => {
    const sim = readyForSauna();
    expect(sim.state.child.wet).toBe("dry");
    expect(sim.state.adult.wet).toBe("dry");
    expect(objective(sim.state)).toContain("子どもで浴室の下側にあるサウナの扉");
    expect(objective(sim.state)).not.toContain("拭");

    sim.switchTo("adult");
    sim.walk([{ x: 4, z: 4.5 }]); // Adult gets wet in the bathwater
    expect(objective(sim.state)).toContain("大人がEを押して体を拭こう");
    expect(objective(sim.state)).not.toContain("子どもと大人");

    sim.walk([{ x: 1.6, z: 7.3 }]);
    expect(pressE(sim)).toBe("タオルで体を拭く"); // the hint and E agree with the objective
    expect(objective(sim.state)).not.toContain("拭");

    sim.switchTo("child");
    R.walkDryToSaunaDoor(sim, { x: 2.0, z: 7.5 });
    pressE(sim);
    expect(sim.state.saunaDoor).toBe("unlocked");
    expect(objective(sim.state)).toContain("親子でサウナへ");
    expect(objective(sim.state)).not.toContain("拭");
  });
});

describe("towel anchors for the human models (Codex review)", () => {
  it("head anchor comes from BODY_HEIGHT and bounds, never from socket_label height", () => {
    for (const [id, h, label] of [["child", 1.2, 1.34], ["adult", 1.7, 1.85]] as const) {
      const labelLocal = label - h / 2; // socket_label in group space (root lowered by h / 2)
      const a = headAnchor(h, labelLocal);
      expect(a).toBeLessThan(labelLocal);
      expect(a).toBeCloseTo(h / 2 + HEAD_TOP_TOLERANCE, 9);
      expect(headAnchor(h, h / 2 + 0.02)).toBeCloseTo(h / 2 + 0.02, 9); // real top within tolerance
      expect(headAnchor(h, undefined)).toBe(h / 2);
      void id;
    }
  });

  it("at the start (in the tub) the held towel hangs from the real hand socket and stays above the water surface", () => {
    // socket_hand_r height above the floor in the shipped GLBs (Codex measurement of 3c1ef71),
    // and the drawn bathwater top: zone box y0 0.012 + height 0.02.
    const HAND_Y = { child: 0.38592, adult: 0.872322 };
    const WATER_SURFACE_Y = 0.032;
    const v = deriveView(new Sim().state, LEVEL);
    for (const id of ["child", "adult"] as const) {
      const c = v.characters[id];
      const hand = { x: -0.2, y: HAND_Y[id] - c.height / 2, z: 0.1 }; // group space: origin = body center
      const p = towelPose("held", { height: c.height, radius: c.radius, hand });
      expect(p.y + TOWEL_DEPTH / 2).toBeCloseTo(hand.y, 9); // top touches the hand: connected
      expect([p.x, p.z]).toEqual([hand.x, hand.z]);
      expect(p.y - TOWEL_DEPTH / 2 + c.height / 2).toBeGreaterThan(WATER_SURFACE_Y); // bottom above the water
    }
  });
});
