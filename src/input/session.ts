// Input boundaries of one play session (DOM-free, so main's wiring is testable):
// which pointer captures and Pointer Lock are held, when they must be given
// back, and what Escape does. Timing (accumulator, last frame) stays in main.
import { EMPTY_INPUT, type GameState, type InputFrame } from "../core/types";
import type { KeyboardState } from "./keyboard";
import type { MouseLook } from "./look";
import type { TouchInput } from "./touch";
export interface SessionDeps {
  /** True while the game canvas holds the pointer lock. */
  isLocked(): boolean;
  exitLock(): void;
  /** Give back the DOM pointer capture of `id` (errors are ignored by the caller). */
  releaseCapture(id: number): void;
  openSettings(): void;
}
export interface SessionState {
  /** Settings, map or action menu is open. */
  modal: boolean;
  /** Page left, or the GPU context was lost: waiting for 続ける. */
  blocked: boolean;
  /** The game is being played (not game over, not cleared). */
  playing: boolean;
}
export class InputSession {
  private state: SessionState = { modal: false, blocked: false, playing: true };
  private captured = new Set<number>();
  constructor(private deps: SessionDeps, readonly kb: KeyboardState, readonly touch: TouchInput, readonly mouse: MouseLook) {}
  /** Gameplay input (look, capture, new locks) is accepted. */
  get active(): boolean {
    return !this.state.modal && !this.state.blocked && this.state.playing;
  }
  /** Remember a pointer capture the game holds (mouse drag or touch look). */
  trackCapture(id: number): void { this.captured.add(id); }
  untrackCapture(id: number): void { this.captured.delete(id); }
  /** Apply a new boundary state; a lock or drag no longer wanted is given back at once. */
  setState(patch: Partial<SessionState>): void {
    this.state = { ...this.state, ...patch };
    this.mouse.setCaptureAllowed(this.active);
    if (!this.active) this.leaveLock();
  }
  private leaveLock(): void {
    if (!this.deps.isLocked()) return;
    this.mouse.noteReleasing();
    this.deps.exitLock();
  }
  /** Drop every held input and capture: modal, blur, hide, rotation, outcome and restart. */
  clearInputs(): void {
    this.kb.blur();
    this.touch.clear();
    this.mouse.invalidate();
    for (const id of this.captured) this.deps.releaseCapture(id);
    this.captured.clear();
    this.leaveLock();
  }
  /** `pointerlockchange`. */
  onLockChange(): void {
    const r = this.mouse.onLockChange(this.deps.isLocked());
    if (r === "release") this.deps.exitLock();
    else if (r === "pause" && this.active) this.deps.openSettings();
  }
  onLockError(): void { this.mouse.onLockError(); }
  /**
   * Escape during ordinary play (nothing captured, drag-only, lock refused):
   * open settings. Modal Escapes belong to the native dialogs, and a lock
   * release already opens settings once (openSettings ignores a second call).
   */
  onEscape(e: { code: string; repeat: boolean; defaultPrevented: boolean }): boolean {
    if (e.code !== "Escape" || e.repeat || e.defaultPrevented || !this.active) return false;
    this.deps.openSettings();
    return true;
  }
}
/**
 * On a game-over screen the restart press is the whole tick input: a held move,
 * run or action is never executed together with it (R and the button alike).
 */
export function gateRestartFrame(s: GameState, f: InputFrame): InputFrame {
  return s.outcome.kind === "gameOver" && f.restart ? { ...EMPTY_INPUT, restart: true } : f;
}
