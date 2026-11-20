import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { DT, REACH } from "../src/core/tuning";
import type { GameState } from "../src/core/types";
import { attachKeyboard, KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance, MAX_TICKS_PER_FRAME } from "../src/loop";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

describe("KeyboardState", () => {
  it("held keys give a normalized move; opposite keys cancel; arrows don't double", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyW");
    kb.keyDown("KeyD");
    const f = kb.takeFrame(false);
    expect(Math.hypot(f.move.x, f.move.z)).toBeCloseTo(1, 9);
    expect(f.move.x).toBeGreaterThan(0);
    expect(f.move.z).toBeLessThan(0);
    kb.keyDown("KeyS");
    expect(kb.takeFrame(false).move).toEqual({ x: 1, z: 0 });
    kb.keyUp("KeyS");
    kb.keyUp("KeyW");
    kb.keyDown("ArrowRight");
    expect(kb.takeFrame(false).move).toEqual({ x: 1, z: 0 });
  });

  it("single presses reach exactly one frame and ignore auto-repeat", () => {
    const kb = new KeyboardState();
    kb.keyDown("Tab");
    kb.keyDown("Tab", true);
    expect(kb.takeFrame(false).switchCharacter).toBe(true);
    expect(kb.takeFrame(false).switchCharacter).toBe(false);
    kb.keyDown("Tab", true); // repeat while held: no new press
    expect(kb.takeFrame(false).switchCharacter).toBe(false);
  });

  it("E means interact normally and confirm while a dialog is open", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyE");
    expect(kb.takeFrame(false)).toMatchObject({ interact: true, confirm: false });
    kb.keyUp("KeyE");
    kb.keyDown("Enter");
    expect(kb.takeFrame(true)).toMatchObject({ interact: false, confirm: true });
  });

  it("losing focus clears held keys and pending presses", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyA");
    kb.keyDown("ShiftLeft");
    kb.keyDown("KeyE");
    kb.blur();
    const f = kb.takeFrame(false);
    expect(f.move).toEqual({ x: 0, z: 0 });
    expect(f.run).toBe(false);
    expect(f.interact).toBe(false);
  });

  it("the overview key is for the camera only and survives takeFrame", () => {
    const kb = new KeyboardState();
    kb.keyDown("KeyC");
    kb.takeFrame(false);
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
  // The events carry the standard KeyboardEvent fields read by the adapter.
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

  it("real key events → frame → tick: T/G inert, E dries, held E fires once, next E after release, E confirms a dialog", () => {
    const { kb, key } = attached();
    const run = (s: GameState) => advance(s, 0, DT, (st) => kb.takeFrame(st.dialog !== null), LEVEL).state;
    const tap = (s: GameState, code: string) => {
      key("keydown", code);
      const next = run(s);
      key("keyup", code);
      return next;
    };
    const sim = new Sim();
    sim.switchTo("child");
    sim.walk([{ x: 2.6, z: 1.0 }]); // wet, at the changing-room exit
    let s = sim.state;
    const before = structuredClone(s.child);
    s = tap(s, "KeyT");
    s = tap(s, "KeyG");
    expect(s.child).toEqual(before);
    key("keydown", "KeyE");
    s = run(s);
    expect(s.child).toMatchObject({ wet: "dry", towel: "head", pos: before.pos });
    s = run(s); // still held: no second action
    expect(s.child.towel).toBe("head");
    key("keyup", "KeyE");
    s = tap(s, "KeyE"); // next E after release: the towel toggle
    expect(s.child.towel).toBe("held");

    // Dialog: E opens the coin handoff, the next E confirms it.
    const d = new Sim();
    R.duckGetsCoin(d);
    d.walk([{ x: 1, z: 5.5 }]);
    d.approach(d.pos("adult"), REACH.give);
    let g = tap(d.state, "KeyE");
    expect(g.dialog).toEqual({ item: "coin", from: "duck", to: "adult" });
    g = tap(g, "KeyE");
    expect(g.dialog).toBeNull();
    expect(g.items.coin.owner).toEqual({ kind: "character", id: "adult" });
  });

  it("uses a move event's Shift modifier without a separate Shift keydown, then clears it on release", () => {
    const { kb, key } = attached();
    expect(key("keydown", "KeyD", true).defaultPrevented).toBe(true);
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: true });
    // Some input sources report Shift only on the move event, including keyup.
    key("keyup", "KeyD", true);
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 0, z: 0 }, run: false });
    key("keydown", "KeyD");
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    key("keyup", "KeyD");
    key("keydown", "KeyJ", true);
    expect(kb.takeFrame(false).run).toBe(false); // no move held: no modifier latch
  });

  it.each(["ShiftLeft", "ShiftRight"])("preserves standard %s events and resumes walking after release", (shift) => {
    const { kb, key } = attached();
    key("keydown", shift, true);
    key("keydown", "ArrowRight", true);
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: true });
    key("keyup", shift);
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    key("keyup", "ArrowRight");
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 0, z: 0 }, run: false });
  });

  it("keeps running when one of two held Shift keys is released", () => {
    const { kb, key } = attached();
    key("keydown", "ShiftLeft", true);
    key("keydown", "ShiftRight", true);
    key("keydown", "KeyD", true);
    key("keyup", "ShiftLeft", true);
    expect(kb.takeFrame(false).run).toBe(true);
    key("keyup", "ShiftRight");
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: false });
  });

  it.each(["blur", "hidden", "detach"] as const)("clears modifier fallback, held keys and pending actions on %s", (action) => {
    const { kb, target, doc, key, stop } = attached();
    key("keydown", "KeyD", true);
    expect(kb.takeFrame(false).run).toBe(true);
    key("keydown", "Tab", true);
    if (action === "blur") target.dispatchEvent(new Event("blur"));
    else if (action === "hidden") {
      doc.visibilityState = "hidden";
      doc.dispatchEvent(new Event("visibilitychange"));
      doc.visibilityState = "visible";
    } else stop();
    expect(kb.moveHeld()).toBe(false);
    expect(kb.takeFrame(false)).toMatchObject({ move: { x: 0, z: 0 }, run: false, switchCharacter: false });
    if (action === "detach") {
      // A detached adapter must no longer accept movement or queued actions.
      expect(key("keydown", "KeyD", true).defaultPrevented).toBe(false);
      key("keydown", "Tab", true);
      expect(kb.takeFrame(false)).toMatchObject({ move: { x: 0, z: 0 }, run: false, switchCharacter: false });
    } else {
      key("keydown", "KeyD");
      expect(kb.takeFrame(false)).toMatchObject({ move: { x: 1, z: 0 }, run: false });
    }
  });

  it.each([true, false])("feeds attached movement through fixed-step soap rules (Shift modifier = %s)", (shiftKey) => {
    const sim = new Sim();
    sim.switchTo("adult");
    sim.walk([{ x: 11, z: 5 }]); // Setup only; the crossing uses actual attached keyboard frames.
    const { kb, key } = attached();
    key("keydown", "KeyD", shiftKey);
    let state = sim.state;
    let accumulator = 0;
    for (let i = 0; i < 60 && state.outcome.kind === "playing"; i++) {
      const result = advance(state, accumulator, DT, (s) => kb.takeFrame(s.dialog !== null), LEVEL);
      state = result.state;
      accumulator = result.accumulator;
    }
    if (shiftKey) expect(state.outcome).toEqual({ kind: "gameOver", reason: "F3" });
    else {
      expect(state.outcome).toEqual({ kind: "playing" });
      expect(state.adult.pos.x).toBeGreaterThan(13);
    }
  });
});

describe("fixed-step loop", () => {
  it("runs one tick per 1/60 s and keeps the remainder", () => {
    const kb = new KeyboardState();
    const r = advance(createInitialState(LEVEL), 0, DT * 2.5, (s) => kb.takeFrame(s.dialog !== null), LEVEL);
    expect(r.ticks).toBe(2);
    expect(r.accumulator).toBeCloseTo(DT * 0.5, 9);
  });

  it("a press during a multi-tick frame switches once; at high refresh rates it waits for the next tick", () => {
    const kb = new KeyboardState();
    let s = createInitialState(LEVEL);
    kb.keyDown("Tab");
    let r = advance(s, 0, DT * 3, (st) => kb.takeFrame(st.dialog !== null), LEVEL);
    expect(r.ticks).toBe(3);
    expect(r.state.active).toBe("child");

    s = r.state;
    kb.keyDown("Tab");
    r = advance(s, 0, DT / 2, (st) => kb.takeFrame(st.dialog !== null), LEVEL); // 120 Hz frame: no tick yet
    expect(r.ticks).toBe(0);
    expect(r.state.active).toBe("child");
    r = advance(r.state, r.accumulator, DT / 2, (st) => kb.takeFrame(st.dialog !== null), LEVEL);
    expect(r.ticks).toBe(1);
    expect(r.state.active).toBe("adult");
  });

  it("caps the ticks per frame after a long gap", () => {
    const kb = new KeyboardState();
    const r = advance(createInitialState(LEVEL), 0, 5, (s) => kb.takeFrame(s.dialog !== null), LEVEL);
    expect(r.ticks).toBe(MAX_TICKS_PER_FRAME);
    expect(r.accumulator).toBe(0);
  });

  it("holding a key moves the active character; blur stops it", () => {
    const kb = new KeyboardState();
    let s = createInitialState(LEVEL);
    kb.keyDown("KeyA");
    s = advance(s, 0, DT * 5, (st) => kb.takeFrame(false), LEVEL).state;
    const x = s.duck.pos.x;
    expect(x).toBeLessThan(LEVEL.initialPositions.duck.x);
    kb.blur();
    s = advance(s, 0, DT * 5, (st) => kb.takeFrame(false), LEVEL).state;
    expect(s.duck.pos.x).toBe(x);
  });
});
