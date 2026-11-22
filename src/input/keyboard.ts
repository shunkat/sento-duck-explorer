// Keyboard → InputFrame. Held keys (move, run) are sampled every tick.
// Single-press keys are queued on keydown (ignoring auto-repeat) and consumed
// by exactly one tick, so they work at any display rate.
import { EMPTY_INPUT, type InputFrame } from "../core/types";

type PressAction = "interact" | "dipTowel" | "shout" | "push" | "restart" | "overview";

const MOVE_KEYS: Record<string, { x: number; z: number }> = {
  KeyW: { x: 0, z: -1 }, ArrowUp: { x: 0, z: -1 },
  KeyS: { x: 0, z: 1 }, ArrowDown: { x: 0, z: 1 },
  KeyA: { x: -1, z: 0 }, ArrowLeft: { x: -1, z: 0 },
  KeyD: { x: 1, z: 0 }, ArrowRight: { x: 1, z: 0 },
};
const RUN_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
/** Held keys that turn the shoulder camera (view only). */
const ORBIT_KEYS: Record<string, number> = { KeyJ: -1, KeyL: 1 };
const PRESS_KEYS: Record<string, PressAction> = {
  KeyE: "interact",
  Enter: "interact",
  KeyQ: "dipTowel",
  KeyV: "shout",
  KeyF: "push",
  KeyR: "restart",
  KeyC: "overview",
};

/** Keys whose browser default (focus change, scrolling) should be suppressed. */
export const HANDLED_KEYS = new Set([
  ...Object.keys(MOVE_KEYS),
  ...RUN_KEYS,
  ...Object.keys(PRESS_KEYS),
  ...Object.keys(ORBIT_KEYS),
  "Space",
]);

export class KeyboardState {
  private held = new Set<string>();
  private pressed = new Set<PressAction>();
  private shiftFromModifier = false;

  keyDown(code: string, repeat = false): void {
    // A key held while a dialog was opened must be released before it can
    // move the player again. Repeats after blur are not new presses.
    if (repeat && !this.held.has(code)) return;
    this.held.add(code);
    const action = PRESS_KEYS[code];
    if (action && !repeat) this.pressed.add(action);
  }

  keyUp(code: string): void {
    this.held.delete(code);
    if (!this.moveHeld()) this.shiftFromModifier = false;
  }

  /**
   * Some input paths (or focusing the game while Shift is already held) send
   * a shifted movement event without a separate Shift keydown. Keep that
   * modifier only while movement is held, so a missing Shift keyup cannot
   * leave the next ordinary movement running.
   */
  syncShiftModifier(shift: boolean): void {
    this.shiftFromModifier = shift && this.moveHeld();
  }

  /** Focus loss: forget held keys (no stuck movement) and pending presses. */
  blur(): void {
    this.held.clear();
    this.pressed.clear();
    this.shiftFromModifier = false;
  }

  /** True while any WASD / arrow key is held. */
  moveHeld(): boolean {
    return Object.keys(MOVE_KEYS).some((k) => this.held.has(k));
  }

  /** −1 (J, turn left), 0, or 1 (L, turn right) from held keys; view only. */
  orbit(): number {
    let o = 0;
    for (const [code, d] of Object.entries(ORBIT_KEYS)) if (this.held.has(code)) o += d;
    return o;
  }

  /** View-only press (camera overview); consumed by the renderer, not the core. */
  takeOverview(): boolean {
    const had = this.pressed.has("overview");
    this.pressed.delete("overview");
    return had;
  }

  /** Build the frame for one logic tick and consume single presses. */
  takeFrame(): InputFrame {
    let x = 0;
    let z = 0;
    for (const [code, d] of Object.entries(MOVE_KEYS)) {
      if (this.held.has(code)) {
        x += d.x;
        z += d.z;
      }
    }
    // Arrow + WASD for the same direction must not double the speed.
    x = Math.sign(x);
    z = Math.sign(z);
    const len = Math.hypot(x, z);
    const p = this.pressed;
    const frame: InputFrame = {
      ...EMPTY_INPUT,
      move: len > 0 ? { x: x / len, z: z / len } : { x: 0, z: 0 },
      run: this.shiftFromModifier || [...RUN_KEYS].some((k) => this.held.has(k)),
      interact: p.has("interact"),
      dipTowel: p.has("dipTowel"),
      shout: p.has("shout"),
      push: p.has("push"),
      restart: p.has("restart"),
    };
    const keepOverview = p.has("overview");
    p.clear();
    if (keepOverview) p.add("overview");
    return frame;
  }
}

/** Wire a KeyboardState to the window. Returns a detach function. */
export function attachKeyboard(kb: KeyboardState, target: Window = window,
  gameplayEnabled: () => boolean = () => true): () => void {
  const down = (e: KeyboardEvent) => {
    if (e.defaultPrevented) return;
    const element = e.target as HTMLElement | null;
    if (element?.closest?.("input, textarea, select, [contenteditable=true]")) return;
    // Keep keyboard activation native; Enter / Space must not interact too.
    if ((e.code === "Enter" || e.code === "Space") && element?.closest?.("button, a, summary")) {
      if (e.repeat) e.preventDefault();
      return;
    }
    if (!gameplayEnabled()) {
      if (HANDLED_KEYS.has(e.code)) e.preventDefault();
      return;
    }
    if (HANDLED_KEYS.has(e.code)) e.preventDefault();
    kb.keyDown(e.code, e.repeat);
    kb.syncShiftModifier(e.shiftKey);
  };
  const up = (e: KeyboardEvent) => {
    kb.keyUp(e.code);
    kb.syncShiftModifier(e.shiftKey);
  };
  const blur = () => kb.blur();
  const vis = () => {
    if (document.visibilityState !== "visible") kb.blur();
  };
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", vis);
  return () => {
    kb.blur();
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
    target.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", vis);
  };
}
