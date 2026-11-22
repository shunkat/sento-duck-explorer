import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { attachKeyboard, KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { HELP_STORAGE_KEY, HelpSettings, type HelpStorage } from "../src/view/helpSettings";
import { Hud } from "../src/view/hud";

afterEach(() => vi.unstubAllGlobals());

const memoryStorage = (): HelpStorage => {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
};

describe("help preference", () => {
  it("defaults on and restores both off and on across new sessions", () => {
    const storage = memoryStorage();
    const settings = new HelpSettings(storage);
    expect(settings.enabled).toBe(true);
    settings.setEnabled(false);
    expect(storage.getItem(HELP_STORAGE_KEY)).toBe("off");
    const reopened = new HelpSettings(storage);
    expect(reopened.enabled).toBe(false);
    reopened.setEnabled(true);
    expect(new HelpSettings(storage).enabled).toBe(true);
  });

  it("remains usable when reading and writing storage are rejected", () => {
    const storage = { getItem() { throw Error("unavailable"); }, setItem() { throw Error("unavailable"); } };
    const settings = new HelpSettings(storage);
    expect(settings.enabled).toBe(true);
    settings.setEnabled(false);
    expect(settings.enabled).toBe(false);
    settings.setEnabled(true);
    expect(settings.enabled).toBe(true);
    vi.stubGlobal("window", Object.defineProperty({}, "localStorage", { get() { throw Error("unavailable"); } }));
    expect(() => new HelpSettings().setEnabled(false)).not.toThrow();
  });
});

// Exercise HUD state and event wiring without creating a WebGL/browser session.
class ElementStub extends EventTarget {
  className = "";
  children: ElementStub[] = [];
  textContent = "";
  innerHTML = "";
  style: Record<string, string> = {};
  hidden = false;
  checked = false;
  open = false;
  focused = false;
  attributes = new Map<string, string>();
  appendChild(child: ElementStub) { this.children.push(child); return child; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  focus() { this.focused = true; }
  showModal() { this.open = true; }
  close() { this.open = false; this.dispatchEvent(new Event("close")); }
  find(cls: string): ElementStub | undefined {
    if (this.className === cls) return this;
    for (const child of this.children) { const found = child.find(cls); if (found) return found; }
    return undefined;
  }
}

describe("settings HUD", () => {
  it("stays paused if a queued close event arrives after settings were reopened", () => {
    vi.stubGlobal("document", { createElement: () => new ElementStub() });
    const root = new ElementStub();
    const pauseChanged = vi.fn();
    const hud = new Hud(root as unknown as HTMLElement, pauseChanged, new HelpSettings(memoryStorage()));
    const button = root.find("hud-settings-button")!;
    const dialog = root.find("hud-settings-dialog")!;
    button.dispatchEvent(new Event("click"));
    dialog.open = false; // Native close() queues the close event instead of firing synchronously.
    button.dispatchEvent(new Event("click"));
    dialog.dispatchEvent(new Event("close"));
    expect(dialog.open).toBe(true);
    expect(hud.isSettingsOpen).toBe(true);
    expect(pauseChanged).toHaveBeenCalledTimes(1);
    dialog.close();
    expect(hud.isSettingsOpen).toBe(false);
    expect(pauseChanged).toHaveBeenCalledTimes(2);
  });

  it("hides contextual help immediately, saves the choice, and retains outcome and action feedback", () => {
    vi.stubGlobal("document", { createElement: () => new ElementStub() });
    const root = new ElementStub();
    const settings = new HelpSettings(memoryStorage());
    const pauseChanged = vi.fn();
    const hud = new Hud(root as unknown as HTMLElement, pauseChanged, settings);
    const state = createInitialState(LEVEL);
    state.player.pos = { ...LEVEL.nodes.milk1 };
    hud.update(state, LEVEL, 1);
    expect(root.find("hud-hints")!.textContent).toContain("牛乳");
    expect(root.find("hud-guide")).toBeUndefined();
    expect(root.find("hud-keys")).toBeUndefined();
    hud.onEvents([{ kind: "prompt", text: "操作ヒント" }], 1);
    hud.update(state, LEVEL, 1);
    expect(root.find("hud-toast")!.style.opacity).toBe("1");

    const button = root.find("hud-settings-button")!;
    button.dispatchEvent(new Event("click"));
    expect(hud.isSettingsOpen).toBe(true);
    expect(button.attributes.get("aria-expanded")).toBe("true");
    expect(root.find("hud-hints")!.hidden).toBe(true);
    const checkbox = root.find("hud-help-toggle")!.children[0]!;
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event("change"));
    // The animation loop is paused while the native settings dialog is open.
    expect(root.find("hud-toast")!.style.opacity).toBe("0");
    expect(root.find("hud-toast")!.textContent).toBe("");
    root.find("hud-settings-close")!.dispatchEvent(new Event("click"));
    expect(hud.isSettingsOpen).toBe(false);
    expect(button.focused).toBe(true);
    expect(pauseChanged).toHaveBeenCalledTimes(2);
    hud.update(state, LEVEL, 2);
    expect(root.find("hud-hints")!.textContent).toBe("");
    hud.onEvents([{ kind: "prompt", text: "操作ヒント" }], 2);
    expect(root.find("hud-toast")!.textContent).toBe("");
    hud.onEvents([{ kind: "grew", milk: "milk1", from: "duck", to: "child" }], 2);
    expect(root.find("hud-toast")!.textContent).toContain("育った");
    state.outcome = { kind: "gameOver", reason: "F2" };
    hud.update(state, LEVEL, 3);
    expect(root.find("hud-overlay over")!.innerHTML).toContain("Rキー");
    state.outcome = { kind: "cleared" };
    hud.update(state, LEVEL, 4);
    expect(root.find("hud-overlay cleared")!.innerHTML).toContain("クリア");
  });
});

describe("settings input boundary", () => {
  it("does not leak native Enter/Space or input keys into gameplay and requires a fresh key after closing", () => {
    const target = new EventTarget();
    vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
    let playing = true;
    const kb = new KeyboardState();
    const detach = attachKeyboard(kb, target as unknown as Window, () => playing, () => playing);
    const press = (code: string, repeat = false, element?: { closest: (selector: string) => boolean }) => {
      const event = new Event("keydown", { cancelable: true });
      Object.defineProperties(event, { code: { value: code }, repeat: { value: repeat }, shiftKey: { value: false },
        ...(element ? { target: { value: element } } : {}) });
      target.dispatchEvent(event);
      return event;
    };
    const button = { closest: (selector: string) => selector === "button, a, summary" };
    expect(press("Enter", false, button).defaultPrevented).toBe(false);
    expect(press("Space", false, button).defaultPrevented).toBe(false);
    expect(kb.takeFrame().interact).toBe(false);
    expect(press("Enter", true, button).defaultPrevented).toBe(true);
    press("KeyW");
    playing = false;
    kb.blur();
    press("KeyW", true);
    press("KeyE");
    press("KeyC");
    expect(kb.takeOverview()).toBe(false);
    expect(press("Space", false, { closest: () => true }).defaultPrevented).toBe(false);
    expect(kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, interact: false });
    playing = true;
    press("KeyW", true);
    expect(kb.moveHeld()).toBe(false);
    press("KeyW");
    expect(kb.moveHeld()).toBe(true);
    detach();
  });
});
