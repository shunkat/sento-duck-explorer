// Exercise the actual entry-point listener: a session-only test cannot detect
// main forgetting to consume the Escape that opened a native dialog.
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Pose } from "../src/view/camera";
import type { View } from "../src/view/deriveView";

const h = vi.hoisted(() => ({
  canvas: null as unknown as ElementStub,
  hud: null as unknown as { isSettingsOpen: boolean; closeSettings(): void },
  win: null as unknown as EventTarget,
  hideFeedback: vi.fn(),
  app: null as unknown as ElementStub,
  coarse: false,
  frame: null as unknown as (now: number) => void,
  render: vi.fn(),
  resize: vi.fn(),
  now: 0,
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
  renderer = { domElement: h.canvas, setAnimationLoop(f: (now: number) => void) { h.frame = f; } };
  hideFeedback = h.hideFeedback;
  setPixelRatioCap() {}
  resetPresentation() {}
  resize = h.resize;
  positionCharacters(view: View) { return view.focus; }
  render = h.render;
} }));
vi.mock("../src/view/minimap", () => ({ MiniMap: class { expanded = false; update() {} } }));
vi.mock("../src/view/hud", () => ({ Hud: class {
  isSettingsOpen = false;
  constructor(_root: unknown, private changed: () => void) { h.hud = this; }
  openSettings() { this.isSettingsOpen = true; this.changed(); }
  closeSettings() { this.isSettingsOpen = false; this.changed(); }
  setPrompt() {}
  onEvents() {}
  setDevWarnings() {}
  update() {}
} }));

beforeEach(() => {
  vi.resetModules();
  h.hideFeedback.mockClear();
  h.render.mockClear();
  h.resize.mockClear();
  h.coarse = false;
  h.now = performance.now();
  h.canvas = new ElementStub();
  h.app = new ElementStub();
  h.win = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390, devicePixelRatio: 1 });
  vi.stubGlobal("window", h.win);
  vi.stubGlobal("document", Object.assign(new EventTarget(), {
    body: new ElementStub(), visibilityState: "visible", pointerLockElement: null,
    getElementById: (id: string) => id === "app" ? h.app : new ElementStub(), createElement: () => new ElementStub(),
  }));
  vi.stubGlobal("matchMedia", () => ({ matches: h.coarse }));
});

function frames(count = 30): Pose {
  h.now = Math.max(h.now, performance.now());
  for (let i = 0; i < count; i++) h.frame(h.now += 16);
  return h.render.mock.lastCall![1] as Pose;
}

it("connects initial coarse input and actual canvas dimensions to portrait camera framing", async () => {
  h.coarse = true;
  h.app.clientWidth = 390;
  h.app.clientHeight = 844;
  await import("../src/main");
  const portrait = frames();
  expect(h.resize).toHaveBeenLastCalledWith(390, 844);
  expect(portrait.fov).toBeGreaterThan(55);

  h.app.clientWidth = 844;
  h.app.clientHeight = 390;
  h.win.dispatchEvent(new Event("resize"));
  const landscape = frames();
  expect(h.resize).toHaveBeenLastCalledWith(844, 390);
  expect(landscape.fov).toBe(55);
  expect(landscape.activeBodyOpacity).toBeDefined();
});

it("switches the real camera on the first late touch, without requiring an orientation change", async () => {
  h.app.clientWidth = 390;
  h.app.clientHeight = 844;
  await import("../src/main");
  const desktop = frames();
  expect(desktop.fov ?? 55).toBe(55);
  h.win.dispatchEvent(Object.assign(new Event("pointerdown"), { pointerType: "touch" }));
  const touch = frames();
  expect(touch.fov).toBeGreaterThan(55);
  expect(touch.eye).not.toEqual(desktop.eye);
  expect(touch.activeBodyOpacity).toBeDefined();
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
