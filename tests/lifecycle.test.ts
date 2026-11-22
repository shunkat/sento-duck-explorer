import { describe, expect, it } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { DT } from "../src/core/tuning";
import { KeyboardState } from "../src/input/keyboard";
import { TouchInput } from "../src/input/touch";
import { LEVEL } from "../src/level/layout";
import { Lifecycle, PAUSE_TEXT } from "../src/lifecycle";
import { advance, MAX_FRAME_SECONDS } from "../src/loop";
describe("leaving the page and losing the GPU context", () => {
  it("away stops play until an explicit continue", () => {
    const l = new Lifecycle();
    expect(l.blocked).toBe(false);
    expect(l.away()).toBe(true);
    expect(l.blocked).toBe(true);
    expect(l.canDraw).toBe(true);
    expect(PAUSE_TEXT.away.button).toBe("続ける");
    expect(l.resume()).toBe(true);
    expect(l.blocked).toBe(false);
    expect(l.resume()).toBe(false);
  });
  it("a context loss cannot be continued past; it needs the restore, then the explicit continue", () => {
    const l = new Lifecycle();
    l.contextLost();
    expect(l.canDraw).toBe(false);
    expect(l.away()).toBe(false); // hide/blur does not hide the loss
    expect(l.resume()).toBe(false);
    expect(PAUSE_TEXT.contextLost.button).toBeNull();
    expect(PAUSE_TEXT.contextLost.body).toContain("最初から");
    l.contextRestored();
    expect(l.canDraw).toBe(true);
    expect(l.blocked).toBe(true); // drawing is back but play waits
    expect(l.resume()).toBe(true);
    expect(l.blocked).toBe(false);
  });
  it("a restore without a loss changes nothing", () => {
    const l = new Lifecycle();
    l.contextRestored();
    expect(l.blocked).toBe(false);
  });
  it("a long absence is never replayed: the accumulator is dropped and one frame is capped", () => {
    const s = createInitialState(LEVEL);
    const kb = new KeyboardState();
    kb.keyDown("KeyW");
    // Even if a frame reported a one-hour gap, at most MAX_FRAME_SECONDS is simulated.
    const r = advance(s, 0, 3600, () => kb.takeFrame(), LEVEL);
    expect(r.ticks).toBeLessThanOrEqual(Math.ceil(MAX_FRAME_SECONDS / DT));
    expect(r.state.tickCount).toBeLessThan(20);
  });
  it("clearing inputs on hide/blur leaves no held key, queued press or run", () => {
    const kb = new KeyboardState();
    const touch = new TouchInput();
    kb.keyDown("KeyD");
    kb.keyDown("ShiftLeft");
    kb.press("interact");
    touch.stickDown(1, 0, 0, 50, 0);
    touch.toggleRun();
    kb.blur();
    touch.clear();
    expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, run: false, interact: false });
    expect(touch.sample()).toEqual({ move: { x: 0, z: 0 }, run: false });
  });
});
