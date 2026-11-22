import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { DT } from "../src/core/tuning";
import { KeyboardState } from "../src/input/keyboard";
import { STICK_RADIUS, TouchInput } from "../src/input/touch";
import { LEVEL } from "../src/level/layout";
import { advance } from "../src/loop";
import { Hud } from "../src/view/hud";
import { HelpSettings } from "../src/view/helpSettings";
import { MENU_ACTIONS, TouchUi } from "../src/view/touchUi";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";
afterEach(() => vi.unstubAllGlobals());
class Stub extends EventTarget {
  className = "";
  children: Stub[] = [];
  textContent = "";
  innerHTML = "";
  style: Record<string, string> = {};
  hidden = false;
  disabled = false;
  open = false;
  checked = false;
  attributes = new Map<string, string>();
  appendChild(c: Stub) { this.children.push(c); return c; }
  setAttribute(n: string, v: string) { this.attributes.set(n, v); }
  removeAttribute(n: string) { this.attributes.delete(n); }
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 112, height: 112 }; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
  setPointerCapture() {}
  findAll(cls: string): Stub[] {
    return [...(this.className.split(" ").includes(cls) ? [this] : []), ...this.children.flatMap((c) => c.findAll(cls))];
  }
  find(cls: string) { return this.findAll(cls)[0]; }
}
const fakeDocument = () => vi.stubGlobal("document", { createElement: () => new Stub() });
const pointer = (type: string, id: number, x = 0, y = 0) => {
  const e = new Event(type, { cancelable: true });
  Object.defineProperties(e, { pointerId: { value: id }, clientX: { value: x }, clientY: { value: y } });
  return e;
};
describe("touch action menu", () => {
  function build() {
    fakeDocument();
    const root = new Stub();
    const order: string[] = [];
    const touch = new TouchInput();
    const ui = new TouchUi(root as unknown as HTMLElement, {
      touch,
      press: (a) => order.push(`press:${a}`),
      onModalChange: (open) => order.push(open ? "modal-open" : "modal-closed"),
    });
    return { root, order, touch, ui };
  }
  it("offers Japanese action names without keyboard labels, only for humans", () => {
    const { root, ui } = build();
    expect(MENU_ACTIONS.map((m) => m.label).join("")).not.toMatch(/\b[A-Z]\b|キー|Shift|Enter/);
    expect(MENU_ACTIONS.map((m) => m.action)).toEqual(["toggleTowel", "dipTowel", "shout", "push"]);
    ui.setStage("duck");
    expect(root.find("touch-menu-button")!.hidden).toBe(true);
    expect(root.find("touch-run")!.hidden).toBe(true);
    ui.setStage("child");
    expect(root.find("touch-menu-button")!.hidden).toBe(false);
    ui.setLabel("牛乳びんを飲む（子どもに育つ）");
    expect(root.find("touch-primary")!.textContent).not.toMatch(/\bE\b/);
  });
  it("opening pauses; choosing an item closes and clears first, then queues the action exactly once", () => {
    const { root, order, ui } = build();
    ui.setStage("adult");
    root.find("touch-menu-button")!.dispatchEvent(new Event("click"));
    expect(ui.menuOpen).toBe(true);
    const items = root.find("touch-menu-list")!.children;
    expect(items).toHaveLength(MENU_ACTIONS.length);
    items[2]!.dispatchEvent(new Event("click")); // 声を出す
    root.find("touch-menu")!.dispatchEvent(new Event("close")); // the native close event arrives later
    expect(ui.menuOpen).toBe(false);
    expect(order).toEqual(["modal-open", "modal-closed", "press:shout"]);
  });
  it("closing without a choice queues nothing", () => {
    const { root, order, ui } = build();
    ui.setStage("adult");
    root.find("touch-menu-button")!.dispatchEvent(new Event("click"));
    root.find("touch-menu-close")!.dispatchEvent(new Event("click"));
    expect(order).toEqual(["modal-open", "modal-closed"]);
  });
  it("run is a tap: aria-pressed follows the toggle and the primary and recenter buttons queue single presses", () => {
    const { root, order, touch } = build();
    const run = root.find("touch-run")!;
    run.dispatchEvent(new Event("click"));
    expect(touch.run).toBe(true);
    expect(run.attributes.get("aria-pressed")).toBe("true");
    run.dispatchEvent(new Event("click"));
    expect(touch.run).toBe(false);
    root.find("touch-primary")!.dispatchEvent(new Event("click"));
    root.find("touch-recenter")!.dispatchEvent(new Event("click"));
    expect(order).toEqual(["press:interact", "press:recenter"]);
  });
  it("pad: only the owner pointer releases the stick; another pointer's up or cancel changes nothing", () => {
    const { root, touch } = build();
    const pad = root.find("touch-pad")!;
    pad.dispatchEvent(pointer("pointerdown", 5, 56 + 52, 56));
    expect(touch.stickOwner).toBe(5);
    expect(touch.stick.x).toBeGreaterThan(0);
    touch.lookDown(6, 700, 100);
    pad.dispatchEvent(pointer("pointerup", 7)); // an unrelated pointer
    pad.dispatchEvent(pointer("pointercancel", 7));
    expect(touch.stickOwner).toBe(5);
    expect(touch.lookOwner).toBe(6);
    pad.dispatchEvent(pointer("lostpointercapture", 5));
    expect(touch.stickOwner).toBeNull();
    expect(touch.lookOwner).toBe(6); // the other finger keeps looking
  });
  it("pad ignores new touches while the menu is open", () => {
    const { root, touch, ui } = build();
    ui.setStage("adult");
    root.find("touch-menu-button")!.dispatchEvent(new Event("click"));
    root.find("touch-pad")!.dispatchEvent(pointer("pointerdown", 9, 100, 56));
    expect(touch.stickOwner).toBeNull();
  });
});
describe("recovery buttons and the pause overlay", () => {
  function hud(touch: boolean) {
    fakeDocument();
    const root = new Stub();
    const onRestart = vi.fn();
    const onContinue = vi.fn();
    const h = new Hud(root as unknown as HTMLElement, () => {}, new HelpSettings({ getItem: () => null, setItem() {} }), { onRestart, onContinue, isTouch: () => touch });
    return { root, h, onRestart, onContinue };
  }
  const click = (el: Stub, action: string) => {
    const e = new Event("click");
    Object.defineProperty(e, "target", { value: { closest: () => ({ getAttribute: () => action }) } });
    el.dispatchEvent(e);
  };
  it("game over and clear offer a tap target that restarts; keyboard wording is hidden on touch", () => {
    for (const touch of [false, true]) {
      const { root, h, onRestart } = hud(touch);
      const s = createInitialState(LEVEL);
      s.outcome = { kind: "gameOver", reason: "F2" };
      h.update(s, LEVEL, 1);
      const over = root.find("over")!;
      expect(over.innerHTML).toContain("data-action=\"restart\"");
      expect(over.innerHTML.includes("Rキー")).toBe(!touch);
      click(over, "restart");
      expect(onRestart).toHaveBeenCalledTimes(1);
      s.outcome = { kind: "cleared" };
      h.update(s, LEVEL, 2);
      const done = root.find("cleared")!;
      expect(done.innerHTML).toContain("最初から遊ぶ");
      expect(done.innerHTML.includes("Rキー")).toBe(!touch);
    }
  });
  it("the pause overlay shows 続ける for away, only an explanation for a context loss, and clears", () => {
    const { root, h, onContinue } = hud(true);
    const pause = root.find("hud-pause")!;
    h.setPause("away");
    expect(pause.innerHTML).toContain("続ける");
    click(pause, "continue");
    expect(onContinue).toHaveBeenCalledTimes(1);
    h.setPause("contextLost");
    expect(pause.innerHTML).not.toContain("data-action");
    expect(pause.innerHTML).toContain("最初から");
    h.setPause(null);
    expect(pause.style.display).toBe("none");
  });
  it("the touch settings text names no keyboard keys", async () => {
    const { TOUCH_HELP } = await import("../src/view/hud");
    for (const line of TOUCH_HELP) expect(line).not.toMatch(/\b[A-Z]\b|キー|Shift|Enter|Esc/);
  });
});
describe("single presses survive any display refresh until a fixed tick takes them", () => {
  it("a touch or on-screen press waits through frames without a tick and acts exactly once", () => {
    const kb = new KeyboardState();
    const sim = new Sim();
    R.duckDrinksMilk1(sim); // Child, towel on the head
    kb.press("toggleTowel");
    let acc = 0;
    let state = sim.state;
    for (let i = 0; i < 3; i++) { // 360 Hz frames: no tick yet
      const r = advance(state, acc, DT / 3 - 1e-9, () => kb.takeFrame(), LEVEL);
      state = r.state;
      acc = r.accumulator;
      expect(r.ticks).toBe(0);
      expect(state.player.towel).toBe("head");
    }
    let r = advance(state, acc, DT, () => kb.takeFrame(), LEVEL);
    expect(r.state.player.towel).toBe("held");
    r = advance(r.state, r.accumulator, DT * 5, () => kb.takeFrame(), LEVEL);
    expect(r.state.player.towel).toBe("held"); // not applied twice
  });
  it("Space recenters (a view-only press kept until the frame loop takes it) and never reaches the core", () => {
    const kb = new KeyboardState();
    kb.keyDown("Space");
    const f = kb.takeFrame();
    expect(Object.values(f).some((v) => v === true)).toBe(false);
    expect(kb.takeRecenter()).toBe(true);
    expect(kb.takeRecenter()).toBe(false);
    kb.keyDown("KeyT");
    expect(kb.takeFrame().toggleTowel).toBe(true);
    expect(kb.takeFrame().toggleTowel).toBe(false);
  });
});
describe("review fixes in the touch UI", () => {
  /** A dialog whose close event is delivered later, like the browser's queued task. */
  class AsyncDialog extends Stub {
    queued = 0;
    override close() { this.open = false; this.queued++; }
    flush() { while (this.queued-- > 0) this.dispatchEvent(new Event("close")); this.queued = 0; }
  }
  function build(asyncClose = false) {
    let n = 0;
    vi.stubGlobal("document", { createElement: (tag: string) => (asyncClose && tag === "dialog" && n++ === 0 ? new AsyncDialog() : new Stub()) });
    const root = new Stub();
    const order: string[] = [];
    const touch = new TouchInput();
    const ui = new TouchUi(root as unknown as HTMLElement, {
      touch,
      press: (a) => order.push(`press:${a}`),
      onModalChange: (open) => order.push(open ? "modal-open" : "modal-closed"),
    });
    ui.setStage("adult");
    return { root, order, touch, ui };
  }
  it("R5: when the run turns itself off the button shows OFF, and the next tap turns it ON, not OFF again", () => {
    const { root, touch, ui } = build();
    const run = root.find("touch-run")!;
    touch.stickDown(1, 60, 500, 60, 500);
    touch.stickMove(1, 60 + STICK_RADIUS, 500);
    run.dispatchEvent(new Event("click"));
    expect(run.attributes.get("aria-pressed")).toBe("true");
    touch.sample(); // moving: stays on
    ui.syncRun();
    expect(run.textContent).toBe("走る（入）");
    touch.release(1); // the finger lifts, the walk stops
    touch.sample(); // run turns itself off here
    ui.syncRun();
    expect(touch.run).toBe(false);
    expect(run.attributes.get("aria-pressed")).toBe("false");
    expect(run.textContent).toBe("走る");
    run.dispatchEvent(new Event("click"));
    expect(touch.run).toBe(true);
    expect(run.attributes.get("aria-pressed")).toBe("true");
  });
  it("R5: syncing the run button leaves the stick knob where it is", () => {
    const { root, touch, ui } = build();
    const pad = root.find("touch-pad")!;
    pad.dispatchEvent(pointer("pointerdown", 5, 56 + 52, 56));
    const before = root.find("touch-knob")!.style.transform;
    expect(before).not.toBe("");
    ui.syncRun();
    expect(root.find("touch-knob")!.style.transform).toBe(before);
    expect(touch.stickOwner).toBe(5);
  });
  it("R6: a late close event after the menu was opened again does not unpause it", () => {
    const { root, order, ui } = build(true);
    const open = root.find("touch-menu-button")!;
    const dialog = root.find("touch-menu")! as AsyncDialog;
    open.dispatchEvent(new Event("click"));
    root.find("touch-menu-close")!.dispatchEvent(new Event("click")); // closed; the event is queued
    expect(ui.menuOpen).toBe(false);
    open.dispatchEvent(new Event("click")); // opened again before the event arrived
    expect(ui.menuOpen).toBe(true);
    dialog.open = true; // showModal() already ran for the reopen
    dialog.flush(); // the old close event is delivered now
    expect(ui.menuOpen).toBe(true);
    expect(order).toEqual(["modal-open", "modal-closed", "modal-open"]);
  });
  it("R6: a normal choice still queues exactly one press with a late close event", () => {
    const { root, order, ui } = build(true);
    root.find("touch-menu-button")!.dispatchEvent(new Event("click"));
    root.find("touch-menu-list")!.children[3]!.dispatchEvent(new Event("click"));
    (root.find("touch-menu")! as AsyncDialog).flush();
    expect(ui.menuOpen).toBe(false);
    expect(order).toEqual(["modal-open", "modal-closed", "press:push"]);
  });
  it("R9: disabled controls ignore taps and the pad, and a menu open at that moment is closed", () => {
    const { root, order, touch, ui } = build();
    root.find("touch-menu-button")!.dispatchEvent(new Event("click"));
    ui.setEnabled(false);
    expect(ui.menuOpen).toBe(false);
    expect(root.attributes.get("inert")).toBe("");
    for (const cls of ["touch-primary", "touch-run", "touch-menu-button"]) {
      expect(root.find(cls)!.disabled).toBe(true);
      root.find(cls)!.dispatchEvent(new Event("click"));
    }
    root.find("touch-pad")!.dispatchEvent(pointer("pointerdown", 3, 100, 56));
    expect(touch.stickOwner).toBeNull();
    expect(touch.run).toBe(false);
    expect(order.filter((o) => o.startsWith("press"))).toEqual([]);
    ui.setEnabled(true);
    expect(root.attributes.has("inert")).toBe(false);
    root.find("touch-primary")!.dispatchEvent(new Event("click"));
    expect(order.at(-1)).toBe("press:interact");
  });
});
