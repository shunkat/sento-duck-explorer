import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { DT } from "../src/core/tuning";
import type { GameState } from "../src/core/types";
import { attachKeyboard, HANDLED_KEYS, KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance, MAX_TICKS_PER_FRAME } from "../src/loop";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;

describe("KeyboardState", () => {
  it("held keys give a normalized move; opposite keys cancel; arrows don't double", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyW");
    kb.keyDown("KeyD");
    const f = kb.takeFrame();
    expect(Math.hypot(f.move.x, f.move.z)).toBeCloseTo(1, 9);
    expect(f.move.x).toBeGreaterThan(0);
    expect(f.move.z).toBeLessThan(0);
    kb.keyDown("KeyS");
    expect(kb.takeFrame().move).toEqual({ x: 1, z: 0 });
    kb.keyUp("KeyS");
    kb.keyUp("KeyW");
    kb.keyDown("ArrowRight");
    expect(kb.takeFrame().move).toEqual({ x: 1, z: 0 });
  });

  it("single presses reach exactly one frame and ignore auto-repeat", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyE");
    kb.keyDown("KeyE", true);
    expect(kb.takeFrame().interact).toBe(true);
    expect(kb.takeFrame().interact).toBe(false);
    kb.keyDown("KeyE", true); // repeat while held: no new press
    expect(kb.takeFrame().interact).toBe(false);
  });

  it("Tab no longer switches anything (growth replaces switching); E and Enter both interact", () => {
    expect(HANDLED_KEYS.has("Tab")).toBe(false);
    const kb = new KeyboardState();
    kb.keyDown("Tab");
    expect(Object.keys(kb.takeFrame())).not.toContain("switchCharacter");
    kb.keyDown("Enter");
    expect(kb.takeFrame().interact).toBe(true);
  });

  it("losing focus clears held keys and pending presses", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyA");
    kb.keyDown("ShiftLeft");
    kb.keyDown("KeyE");
    kb.blur();
    const f = kb.takeFrame();
    expect(f.move).toEqual({ x: 0, z: 0 });
    expect(f.run).toBe(false);
    expect(f.interact).toBe(false);
  });

  it("the overview key is for the camera only and survives takeFrame", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyC");
    kb.takeFrame();
    expect(kb.takeOverview()).toBe(true);
    expect(kb.takeOverview()).toBe(false);
  });
});

describe("attached keyboard events", () => {
  let detach: (() => void) | undefined;

  afterEach(() => {
    detach?.();
    detach = undefined;
    vi.unstubAllGlobals();
  });

  // Node EventTargets exercise the real listeners without a browser or WebGL.
  function attached() {
    const target = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    vi.stubGlobal("document", doc);
    const kb = new KeyboardState();
    const stop = attachKeyboard(kb, target as unknown as Window);
    detach = stop;
    const key = (type: "keydown" | "keyup", code: string, shiftKey = false) => {
      const event = new Event(type, { cancelable: true });
      Object.defineProperties(event, {
        code: { value: code },
        repeat: { value: false },
        shiftKey: { value: shiftKey },
      });
      target.dispatchEvent(event);
      return event;
    };
    return { kb, target, doc, key, stop };
  }

  it("real key events → frame → tick: Tab/T/G inert, E drinks milk once while held, the next E after release moves the towel", () => {
    const { kb, key } = attached();
    const run = (s: GameState) => advance(s, 0, DT, () => kb.takeFrame(), LEVEL).state;
    const tap = (s: GameState, code: string) => {
      key("keydown", code);
      const next = run(s);
      key("keyup", code);
      return next;
    };
    const sim = new Sim();
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    let s = sim.state;
    const before = structuredClone(s.player);
    for (const code of ["Tab", "KeyT", "KeyG"]) s = tap(s, code);
    expect(s.player).toEqual(before);
    key("keydown", "KeyE");
    s = run(s);
    expect(s.player).toMatchObject({ stage: "child", towel: "head", pos: before.pos });
    s = run(s); // still held: no second action
    expect(s.player.towel).toBe("head");
    key("keyup", "KeyE");
    s = tap(s, "KeyE"); // next E after release: the towel toggle
    expect(s.player.towel).toBe("held");
  });

  it("uses a move event's Shift modifier without a separate Shift keydown, then clears it on release", () => {
    const { kb, key } = attached();
    expect(key("keydown", "KeyD", true).defaultPrevented).toBe(true);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: true });
    key("keyup", "KeyD", true);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, run: false });
    key("keydown", "KeyD");
    expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    key("keyup", "KeyD");
    key("keydown", "KeyJ", true);
    expect(kb.takeFrame().run).toBe(false); // no move held: no modifier latch
  });

  it.each(["ShiftLeft", "ShiftRight"])("preserves standard %s events and resumes walking after release", (shift) => {
    const { kb, key } = attached();
    key("keydown", shift, true);
    key("keydown", "ArrowRight", true);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: true });
    key("keyup", shift);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    key("keyup", "ArrowRight");
    expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, run: false });
  });

  it("keeps running when one of two held Shift keys is released", () => {
    const { kb, key } = attached();
    key("keydown", "ShiftLeft", true);
    key("keydown", "ShiftRight", true);
    key("keydown", "KeyD", true);
    key("keyup", "ShiftLeft", true);
    expect(kb.takeFrame().run).toBe(true);
    key("keyup", "ShiftRight");
    expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: false });
  });

  it.each(["blur", "hidden", "detach"] as const)("clears modifier fallback, held keys and pending actions on %s", (action) => {
    const { kb, target, doc, key, stop } = attached();
    key("keydown", "KeyD", true);
    expect(kb.takeFrame().run).toBe(true);
    key("keydown", "KeyE", true);
    if (action === "blur") target.dispatchEvent(new Event("blur"));
    else if (action === "hidden") {
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      doc.visibilityState = "visible";
    } else stop();
    expect(kb.moveHeld()).toBe(false);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, run: false, interact: false });
    if (action === "detach") {
      expect(key("keydown", "KeyD", true).defaultPrevented).toBe(false);
      key("keydown", "KeyE", true);
      expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, run: false, interact: false });
    } else {
      key("keydown", "KeyD");
      expect(kb.takeFrame()).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    }
  });

  it.each([true, false])("feeds attached movement through fixed-step soap rules (Shift modifier = %s)", (shiftKey) => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    sim.walk([W.gateIn]);
    sim.press("interact");
    const soap = LEVEL.soaps[0]!.pos;
    sim.walk([W.gateOut, { x: 3.0, z: 2.3 }, { x: soap.x, z: soap.z + 1.4 }]); // Setup only; the approach uses attached keyboard frames.
    const { kb, key } = attached();
    key("keydown", "KeyW", shiftKey);
    let state = sim.state;
    let accumulator = 0;
    for (let i = 0; i < 60 && state.outcome.kind === "playing"; i++) {
      const result = advance(state, accumulator, DT, () => kb.takeFrame(), LEVEL);
      state = result.state;
      accumulator = result.accumulator;
    }
    if (shiftKey) expect(state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
    else {
      expect(state.outcome).toEqual({ kind: "playing" });
      expect(state.player.pos.z).toBeLessThan(soap.z + 0.5); // walked over the soap
    }
  });
});

describe("fixed-step loop", () => {
  it("runs one tick per 1/60 s and keeps the remainder", () => {
    const kb = new KeyboardState();
    const r = advance(createInitialState(LEVEL), 0, DT * 2.5, () => kb.takeFrame(), LEVEL);
    expect(r.ticks).toBe(2);
    expect(r.accumulator).toBeCloseTo(DT * 0.5, 9);
  });

  it("a press during a multi-tick frame acts once; at high refresh rates it waits for the next tick", () => {
    const kb = new KeyboardState();
    const sim = new Sim();
    R.duckDrinksMilk1(sim); // Child, towel on the head
    kb.keyDown("KeyE");
    let r = advance(sim.state, 0, DT * 3, () => kb.takeFrame(), LEVEL);
    expect(r.ticks).toBe(3);
    expect(r.state.player.towel).toBe("held");
    kb.keyUp("KeyE");
    kb.keyDown("KeyE");
    r = advance(r.state, 0, DT / 2, () => kb.takeFrame(), LEVEL); // 120 Hz frame: no tick yet
    expect(r.ticks).toBe(0);
    expect(r.state.player.towel).toBe("held");
    r = advance(r.state, r.accumulator, DT / 2, () => kb.takeFrame(), LEVEL);
    expect(r.ticks).toBe(1);
    expect(r.state.player.towel).toBe("head");
  });

  it("caps the ticks per frame after a long gap", () => {
    const kb = new KeyboardState();
    const r = advance(createInitialState(LEVEL), 0, 5, () => kb.takeFrame(), LEVEL);
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(r.accumulator).toBe(0);
  });

  it("holding a key moves the player; blur stops it", () => {
    const kb = new KeyboardState();
    let s = createInitialState(LEVEL);
    kb.keyDown("KeyA");
    s = advance(s, 0, DT * 5, () => kb.takeFrame(), LEVEL).state;
    const x = s.player.pos.x;
    expect(x).toBeLessThan(LEVEL.start.x);
    kb.blur();
    s = advance(s, 0, DT * 5, () => kb.takeFrame(), LEVEL).state;
    expect(s.player.pos.x).toBe(x);
  });
});
