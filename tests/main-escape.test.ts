// Exercise the actual entry-point listener: a session-only test cannot detect
// main forgetting to consume the Escape that opened a native dialog.
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  canvas: null as unknown as ElementStub,
  hud: null as unknown as { isSettingsOpen: boolean; closeSettings(): void },
  win: null as unknown as EventTarget,
  hideFeedback: vi.fn(),
}));

class ElementStub extends EventTarget {
  style = {};
  clientWidth = 844;
  clientHeight = 390;
  classList = { add() {}, toggle() {} };
  appendChild(child: ElementStub) { return child; }
  setAttribute() {}
  removeAttribute() {}
  focus() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 112, height: 112 }; }
}

vi.mock("../src/view/modelEntry", () => ({
  CHARACTER_MODEL_URLS: {}, ITEM_MODEL_URLS: {}, ENVIRONMENT_MODEL_URLS: {},
}));
vi.mock("../src/view/scene", () => ({ GameScene: class {
  renderer = { domElement: h.canvas, setAnimationLoop() {} };
  hideFeedback = h.hideFeedback;
  setPixelRatioCap() {}
  resize() {}
} }));
vi.mock("../src/view/minimap", () => ({ MiniMap: class { expanded = false; } }));
vi.mock("../src/view/hud", () => ({ Hud: class {
  isSettingsOpen = false;
  constructor(_root: unknown, private changed: () => void) { h.hud = this; }
  openSettings() { this.isSettingsOpen = true; this.changed(); }
  closeSettings() { this.isSettingsOpen = false; this.changed(); }
  setPrompt() {}
} }));

beforeEach(() => {
  vi.resetModules();
  h.hideFeedback.mockClear();
  h.canvas = new ElementStub();
  h.win = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 });
  vi.stubGlobal("window", h.win);
  vi.stubGlobal("document", Object.assign(new EventTarget(), {
    body: new ElementStub(), visibilityState: "visible", pointerLockElement: null,
    getElementById: () => new ElementStub(), createElement: () => new ElementStub(),
  }));
  vi.stubGlobal("matchMedia", () => ({ matches: false }));
});
afterEach(() => vi.unstubAllGlobals());

it("consumes only the Escape that opens settings, leaving the next Escape to the native dialog", async () => {
  await import("../src/main");
  const escape = () => Object.assign(new Event("keydown", { cancelable: true }), {
    code: "Escape", repeat: false, shiftKey: false,
  });
  const first = escape();
  h.win.dispatchEvent(first);
  expect(h.hud.isSettingsOpen).toBe(true);
  expect(first.defaultPrevented).toBe(true);
  expect(h.hideFeedback).toHaveBeenCalledOnce();

  const second = escape();
  h.win.dispatchEvent(second);
  expect(second.defaultPrevented).toBe(false);
  expect(h.hideFeedback).toHaveBeenCalledOnce();
  // Native cancel/close is covered by the designated browser check; emulate
  // its state transition here and ensure a later fresh Escape can open again.
  h.hud.closeSettings();
  const third = escape();
  h.win.dispatchEvent(third);
  expect(h.hud.isSettingsOpen).toBe(true);
  expect(third.defaultPrevented).toBe(true);
});
