import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { DT } from "../src/core/tuning";
import { KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance, MAX_TICKS_PER_FRAME } from "../src/loop";

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
