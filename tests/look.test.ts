import { describe, expect, it, vi } from "vitest";
import { DEFAULT_CONTROLS, type ControlValues, ControlSettings, CONTROL_STORAGE_KEY, parseControls } from "../src/input/controlSettings";
import { CLICK_MAX_MOVE_PX, MouseLook } from "../src/input/look";
import { ORBIT_DRAG_RATE } from "../src/view/shoulder";
import { DESKTOP_PIXEL_RATIO_CAP, effectivePixelRatio, LIGHT_PIXEL_RATIO_CAP, MOBILE_PIXEL_RATIO_CAP, pixelRatioCap } from "../src/view/renderQuality";
function rig(overrides: Partial<ControlValues> = {}, lock: () => Promise<void> | void = () => undefined) {
  const values = { ...DEFAULT_CONTROLS, ...overrides };
  const sink = { orbit: vi.fn(), tilt: vi.fn() };
  const target = { requestPointerLock: vi.fn(lock) };
  let locked = false;
  const look = new MouseLook(sink, () => values, target, () => locked);
  return { look, sink, target, values, setLocked: (v: boolean) => { locked = v; } };
}
const click = (look: MouseLook) => {
  look.pointerDown(1, 0, 100, 100, 0);
  return look.pointerUp(1, 100);
};
describe("mouse look", () => {
  it("a deliberate click asks for Pointer Lock once; a drag or a slow press does not", () => {
    const r = rig();
    expect(click(r.look)).toBe(true);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
    const d = rig();
    d.look.pointerDown(1, 0, 0, 0, 0);
    d.look.pointerMove(1, CLICK_MAX_MOVE_PX + 20, 0);
    expect(d.look.pointerUp(1, 100)).toBe(false);
    expect(d.target.requestPointerLock).not.toHaveBeenCalled();
    const s = rig();
    s.look.pointerDown(1, 0, 0, 0, 0);
    expect(s.look.pointerUp(1, 5000)).toBe(false);
  });
  it("right-drag turns the view at once with sensitivity and invert-Y; up looks up by default", () => {
    const r = rig({ sensitivity: 2 });
    r.look.pointerDown(1, 2, 0, 0, 0);
    r.look.pointerMove(1, 10, -10);
    expect(r.sink.orbit).toHaveBeenCalledWith(10 * ORBIT_DRAG_RATE * 2);
    expect(r.sink.tilt).toHaveBeenCalledWith(10 * ORBIT_DRAG_RATE * 2);
    const inv = rig({ invertY: true });
    inv.look.pointerDown(1, 2, 0, 0, 0);
    inv.look.pointerMove(1, 0, -10);
    expect(inv.sink.tilt).toHaveBeenCalledWith(-10 * ORBIT_DRAG_RATE);
  });
  it("drag-only mode never requests the lock", () => {
    const r = rig({ dragOnly: true });
    expect(click(r.look)).toBe(false);
    expect(r.look.requestLock()).toBe(false);
    expect(r.target.requestPointerLock).not.toHaveBeenCalled();
  });
  it("locked movement turns the view only while locked and allowed", () => {
    const r = rig();
    r.look.lockedMove(5, 0);
    expect(r.sink.orbit).not.toHaveBeenCalled();
    r.setLocked(true);
    r.look.lockedMove(5, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
    r.look.setCaptureAllowed(false); // a modal opened
    r.look.lockedMove(5, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
  });
  it("handles a rejected Promise, an old void API and a throwing API without throwing or retrying", async () => {
    const rejected = rig({}, () => Promise.reject(new Error("denied")));
    expect(click(rejected.look)).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(rejected.target.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(click(rejected.look)).toBe(true); // the next deliberate click may try again; nothing loops
    expect(rejected.target.requestPointerLock).toHaveBeenCalledTimes(2);
    const legacy = rig({}, () => undefined);
    expect(click(legacy.look)).toBe(true);
    const throwing = rig({}, () => { throw new Error("SecurityError"); });
    expect(click(throwing.look)).toBe(false); // reported as not requested; nothing is thrown
    expect(throwing.target.requestPointerLock).toHaveBeenCalledTimes(1);
  });
  it("a delayed request is not repeated while pending, and no request is made after a modal or blur", () => {
    let settle!: () => void;
    const r = rig({}, () => new Promise<void>((res) => { settle = res; }));
    expect(r.look.requestLock()).toBe(true);
    expect(r.look.requestLock()).toBe(false); // still pending: no stacking
    r.look.setCaptureAllowed(false);
    expect(click(r.look)).toBe(false);
    expect(r.look.requestLock()).toBe(false);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
    settle();
  });
  it("cancel or capture loss ends only the drag owned by that pointer", () => {
    const r = rig();
    r.look.pointerDown(1, 2, 0, 0, 0);
    r.look.pointerEnd(2);
    r.look.pointerMove(1, 10, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
    r.look.pointerEnd(1);
    r.look.pointerMove(1, 20, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
  });
});
describe("look and render preferences", () => {
  it("validates stored values field by field and survives unavailable storage", () => {
    expect(parseControls("not json")).toEqual(DEFAULT_CONTROLS);
    expect(parseControls(JSON.stringify({ sensitivity: 99, invertY: "yes", dragOnly: true, lightweight: 1 }))).toEqual({ ...DEFAULT_CONTROLS, sensitivity: 2.5, dragOnly: true });
    const broken = { getItem() { throw Error("no"); }, setItem() { throw Error("no"); } };
    const c = new ControlSettings(broken);
    c.update({ invertY: true });
    expect(c.values.invertY).toBe(true);
    const store = new Map<string, string>();
    const ok = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); } };
    new ControlSettings(ok).update({ lightweight: true });
    expect(store.has(CONTROL_STORAGE_KEY)).toBe(true);
    expect(new ControlSettings(ok).values.lightweight).toBe(true);
  });
  it("pixel ratio caps: desktop 2, phone 1.5, lightweight 1.25, never above the device ratio", () => {
    expect(pixelRatioCap({ coarsePointer: false, lightweight: false })).toBe(DESKTOP_PIXEL_RATIO_CAP);
    expect(pixelRatioCap({ coarsePointer: true, lightweight: false })).toBe(MOBILE_PIXEL_RATIO_CAP);
    expect(pixelRatioCap({ coarsePointer: true, lightweight: true })).toBe(LIGHT_PIXEL_RATIO_CAP);
    expect(effectivePixelRatio(3, 1.5)).toBe(1.5);
    expect(effectivePixelRatio(1, 1.5)).toBe(1);
    expect(effectivePixelRatio(Number.NaN, 1.5)).toBe(1);
    expect(1 - (1.5 / 2) ** 2).toBeCloseTo(0.4375, 9);
    expect(1 - (1.25 / 2) ** 2).toBeCloseTo(0.609375, 9);
  });
});
