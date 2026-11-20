// Keyboard → InputFrame. Held keys (move, run) are sampled every tick.
// Single-press keys are queued on keydown (ignoring auto-repeat) and consumed
// by exactly one tick, so they work at any display rate.
import { EMPTY_INPUT, type InputFrame } from "../core/types";

type PressAction =
  | "switchCharacter" | "interact" | "cancel" | "dry" | "dipTowel"
  | "toggleClothes" | "shout" | "push" | "restart" | "overview";

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
  Tab: "switchCharacter",
  KeyE: "interact",
  Enter: "interact",
  Escape: "cancel",
  KeyT: "dry",
  KeyQ: "dipTowel",
  KeyG: "toggleClothes",
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

  keyDown(code: string, repeat = false): void {
    this.held.add(code);
    const action = PRESS_KEYS[code];
    if (action && !repeat) this.pressed.add(action);
  }

  keyUp(code: string): void {
    this.held.delete(code);
  }

  /** Focus loss: forget held keys (no stuck movement) and pending presses. */
  blur(): void {
    this.held.clear();
    this.pressed.clear();
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

  /**
   * Build the frame for one logic tick and consume single presses.
   * While a transfer dialog is open, E / Enter mean "confirm".
   */
  takeFrame(dialogOpen: boolean): InputFrame {
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
      run: [...RUN_KEYS].some((k) => this.held.has(k)),
      switchCharacter: p.has("switchCharacter"),
      interact: !dialogOpen && p.has("interact"),
      confirm: dialogOpen && p.has("interact"),
      cancel: p.has("cancel"),
      dry: p.has("dry"),
      dipTowel: p.has("dipTowel"),
      toggleClothes: p.has("toggleClothes"),
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
export function attachKeyboard(kb: KeyboardState, target: Window = window): () => void {
  const down = (e: KeyboardEvent) => {
    if (HANDLED_KEYS.has(e.code)) e.preventDefault();
    kb.keyDown(e.code, e.repeat);
  };
  const up = (e: KeyboardEvent) => kb.keyUp(e.code);
  const blur = () => kb.blur();
  const vis = () => {
    if (document.visibilityState !== "visible") kb.blur();
  };
  target.addEventListener("keydown", down);
  target.addEventListener("keyup", up);
  target.addEventListener("blur", blur);
  document.addEventListener("visibilitychange", vis);
  return () => {
    target.removeEventListener("keydown", down);
    target.removeEventListener("keyup", up);
    target.removeEventListener("blur", blur);
    document.removeEventListener("visibilitychange", vis);
  };
}
