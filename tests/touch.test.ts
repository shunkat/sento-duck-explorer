import { describe, expect, it } from "vitest";
import { LOOK_REGION_START, MOVE_REGION_END, regionAt, STICK_DEADZONE, STICK_RADIUS, stickVector, TouchInput } from "../src/input/touch";
describe("touch regions and stick", () => {
  it("the move region ends by 48 %, the look region starts at 52 %, and the gap belongs to neither", () => {
    expect(MOVE_REGION_END).toBeLessThanOrEqual(0.48);
    expect(LOOK_REGION_START).toBeGreaterThanOrEqual(0.52);
    for (const w of [320, 390, 568, 844]) {
      expect(regionAt(w * 0.48, w)).toBe("move");
      expect(regionAt(w * 0.5, w)).toBe("gap");
      expect(regionAt(w * 0.52, w)).toBe("look");
      expect(regionAt(w, w)).toBe("look");
    }
  });
  it("the stick is analog with a dead zone, never above length 1, and ends where the full range is reached", () => {
    expect(stickVector(0, 0)).toEqual({ x: 0, z: 0 });
    expect(stickVector(STICK_RADIUS * STICK_DEADZONE * 0.9, 0)).toEqual({ x: 0, z: 0 });
    const half = stickVector(STICK_RADIUS / 2, 0);
    expect(half.x).toBeGreaterThan(0);
    expect(half.x).toBeLessThan(1);
    const full = stickVector(STICK_RADIUS * 3, STICK_RADIUS * 3);
    expect(Math.hypot(full.x, full.z)).toBeCloseTo(1, 9);
    expect(full.x).toBeCloseTo(full.z, 9);
    expect(stickVector(Number.NaN, 4)).toEqual({ x: 0, z: 0 });
  });
});
describe("two fingers stay independent", () => {
  const start = () => {
    const t = new TouchInput();
    t.stickDown(1, 60, 500, 60, 500);
    t.lookDown(2, 600, 300);
    return t;
  };
  it("lifting, cancelling or losing capture on one finger leaves the other control untouched", () => {
    let t = start();
    t.stickMove(1, 120, 500);
    expect(t.release(2)).toBe("look");
    expect(t.stickOwner).toBe(1);
    expect(t.stick.x).toBeGreaterThan(0);
    t = start();
    t.stickMove(1, 120, 500);
    expect(t.release(1)).toBe("stick");
    expect(t.stick).toEqual({ x: 0, z: 0 });
    expect(t.lookOwner).toBe(2);
    expect(t.lookMove(2, 610, 300)!.yaw).toBeLessThan(0);
    expect(t.release(99)).toBeNull(); // an unknown pointer owns nothing
  });
  it("a second finger never takes over an owned control, and a released control is not handed on", () => {
    const t = start();
    expect(t.stickDown(3, 60, 500, 100, 500)).toBe(false);
    expect(t.lookDown(4, 700, 300)).toBe(false);
    expect(t.lookMove(4, 710, 300)).toBeNull();
    t.stickMove(3, 110, 500); // finger 3 does not own the stick
    expect(t.stick).toEqual({ x: 0, z: 0 });
    t.release(1);
    expect(t.stickOwner).toBeNull();
    t.stickMove(3, 110, 500); // finger 3 stays a non-owner after finger 1 left
    expect(t.stick).toEqual({ x: 0, z: 0 });
  });
  it("look turns opposite to the owner's finger and a fresh drag starts without a jump", () => {
    const t = new TouchInput();
    t.lookDown(7, 500, 200);
    const a = t.lookMove(7, 520, 190)!;
    expect(a.yaw).toBeLessThan(0); // dragging right looks left
    expect(a.pitch).toBeLessThan(0); // dragging up looks down
    const back = t.lookMove(7, 500, 200)!;
    expect(back.yaw).toBeCloseTo(-a.yaw); // left looks right, from the last point
    expect(back.pitch).toBeCloseTo(-a.pitch); // down looks up
    t.release(7);
    t.lookDown(8, 100, 100);
    expect(t.lookMove(8, 100, 100)).toEqual({ yaw: -0, pitch: 0 });
  });
});
describe("run is a tap toggle", () => {
  const moving = () => {
    const t = new TouchInput();
    t.stickDown(1, 60, 500, 60, 500);
    t.stickMove(1, 60 + STICK_RADIUS, 500);
    return t;
  };
  it("defaults off; a full-tilt stick still only walks", () => {
    const t = moving();
    expect(t.run).toBe(false);
    expect(t.sample()).toMatchObject({ run: false });
    expect(Math.hypot(t.sample().move.x, t.sample().move.z)).toBeCloseTo(1, 9);
  });
  it("a tap turns it on and another tap off, with no hold needed", () => {
    const t = moving();
    expect(t.toggleRun()).toBe(true);
    expect(t.sample().run).toBe(true);
    expect(t.sample().run).toBe(true); // stays on without any held finger
    expect(t.toggleRun()).toBe(false);
    expect(t.sample().run).toBe(false);
  });
  it("turns itself off when the movement it covered stops, but waits if tapped before moving", () => {
    const t = new TouchInput();
    t.toggleRun();
    expect(t.sample()).toMatchObject({ run: false, move: { x: 0, z: 0 } });
    expect(t.run).toBe(true); // still armed: no movement has happened yet
    t.stickDown(1, 60, 500, 60, 500);
    t.stickMove(1, 60 + STICK_RADIUS, 500);
    expect(t.sample().run).toBe(true);
    t.release(1);
    expect(t.sample().run).toBe(false);
    expect(t.run).toBe(false);
  });
  it("clear (menu, map, settings, blur, hide, outcome, restart, rotation) drops stick, look and run", () => {
    const t = moving();
    t.lookDown(2, 600, 200);
    t.toggleRun();
    t.clear();
    expect([t.run, t.stickOwner, t.lookOwner, t.stick]).toEqual([false, null, null, { x: 0, z: 0 }]);
    expect(t.sample()).toEqual({ move: { x: 0, z: 0 }, run: false });
  });
  it("does not need three fingers: move + look + run toggled by a tap while both owners keep their fingers", () => {
    const t = moving();
    t.lookDown(2, 600, 200);
    t.toggleRun(); // a third touch only taps, then lifts
    expect([t.stickOwner, t.lookOwner, t.sample().run]).toEqual([1, 2, true]);
  });
});
