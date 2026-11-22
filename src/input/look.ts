// Mouse look (PC): optional Pointer Lock, right-drag fallback, J/L stays in the
// keyboard module. DOM-free core so every path is testable. View only.
import { ORBIT_DRAG_RATE } from "../view/shoulder";
import type { ControlValues } from "./controlSettings";
/** The subset of an element used for locking; `requestPointerLock` may return a Promise or nothing. */
export interface LockTarget {
  requestPointerLock(): Promise<void> | void;
}
export interface LookSink {
  orbit(deltaYaw: number): void;
  tilt(deltaPitch: number): void;
}
/** A deliberate click: the pointer barely moved and was released quickly. */
export const CLICK_MAX_MOVE_PX = 6;
export const CLICK_MAX_MS = 400;
/** What the caller does after a pointer-lock change. */
export type LockOutcome = "keep" | "release" | "pause" | "none";
export class MouseLook {
  /** False while a modal is open, the page is blurred, the game ended or the lock is unwanted. */
  private captureAllowed = true;
  /**
   * Increments whenever the input boundary changes (modal, blur, outcome, reset).
   * A request remembers its epoch; a grant from an older epoch is always given back.
   */
  private epoch = 0;
  /** Epoch of the request still waiting for its grant or error (void and Promise APIs alike). */
  private pending: number | null = null;
  private wasLocked = false;
  private weReleased = false;
  private drag: { id: number; x: number; y: number; startX: number; startY: number; startT: number; moved: number; button: number } | null = null;
  constructor(private sink: LookSink, private settings: () => ControlValues, private lockTarget: LockTarget,
    private isLocked: () => boolean = () => false) {}
  /** Allow or forbid capture. Forbidding invalidates a request in flight and drops the drag. */
  setCaptureAllowed(allowed: boolean): void {
    if (this.captureAllowed && !allowed) this.invalidate();
    this.captureAllowed = allowed;
  }
  /** Boundary reset (modal, blur, rotation, outcome, restart): no drag, no pending grant survives. */
  invalidate(): void {
    this.epoch++;
    this.pending = null;
    this.drag = null;
  }
  /** The pointer id of a drag in progress (so the caller can release its DOM capture). */
  get dragPointer(): number | null { return this.drag?.id ?? null; }
  get locked(): boolean { return this.isLocked(); }
  /** The caller is about to leave the lock itself; the resulting change is not an Escape. */
  noteReleasing(): void { this.weReleased = true; }
  /** `pointerlockchange`. The caller exits the lock on "release" and opens settings on "pause". */
  onLockChange(locked: boolean): LockOutcome {
    if (locked) {
      const fresh = this.pending !== null && this.pending === this.epoch && this.captureAllowed;
      this.pending = null;
      if (!fresh) {
        this.weReleased = true; // the give-back below is ours, not an Escape
        this.wasLocked = true;
        return "release";
      }
      this.wasLocked = true;
      return "keep";
    }
    const was = this.wasLocked;
    this.wasLocked = false;
    if (this.weReleased) {
      this.weReleased = false;
      return "none";
    }
    return was && this.captureAllowed ? "pause" : "none";
  }
  /** `pointerlockerror`: the request ended; nothing is retried by itself. */
  onLockError(): void {
    this.pending = null;
    this.weReleased = false;
  }
  private apply(dx: number, dy: number): void {
    const s = this.settings();
    const k = ORBIT_DRAG_RATE * s.sensitivity;
    this.sink.orbit(dx * k);
    // Moving the mouse up looks up unless inverted.
    this.sink.tilt((s.invertY ? 1 : -1) * dy * k);
  }
  /** Pointer lock movement (movementX/Y). Ignored unless locked and allowed. */
  lockedMove(dx: number, dy: number): void {
    if (!this.captureAllowed || !this.isLocked()) return;
    this.apply(dx, dy);
  }
  pointerDown(id: number, button: number, x: number, y: number, t: number): void {
    if (!this.captureAllowed || this.isLocked()) return;
    this.drag = { id, x, y, startX: x, startY: y, startT: t, moved: 0, button };
  }
  pointerMove(id: number, x: number, y: number): void {
    const d = this.drag;
    if (!d || d.id !== id || !this.captureAllowed) return;
    // The right button drags at once; the left button drags once it moved too far to be a click.
    d.moved = Math.max(d.moved, Math.hypot(x - d.startX, y - d.startY));
    if (d.button === 2 || d.moved > CLICK_MAX_MOVE_PX) this.apply(x - d.x, y - d.y);
    d.x = x;
    d.y = y;
  }
  /** Returns true when the release was a deliberate click that asked for a lock. */
  pointerUp(id: number, t: number): boolean {
    const d = this.drag;
    if (!d || d.id !== id) return false;
    this.drag = null;
    const click = d.button === 0 && d.moved <= CLICK_MAX_MOVE_PX && t - d.startT <= CLICK_MAX_MS;
    if (!click || this.settings().dragOnly) return false;
    return this.requestLock();
  }
  /** Ends a drag owned by this pointer (cancel, lost capture). */
  pointerEnd(id: number): void {
    if (this.drag?.id === id) this.drag = null;
  }
  /**
   * Ask for Pointer Lock once per input boundary. Never throws; never loops.
   * The request stays pending until the grant or the error, whatever the API returns.
   */
  requestLock(): boolean {
    if (!this.captureAllowed || this.pending === this.epoch || this.isLocked() || this.settings().dragOnly) return false;
    const mine = this.epoch;
    this.pending = mine;
    try {
      const r = this.lockTarget.requestPointerLock();
      if (r && typeof (r as Promise<void>).then === "function") {
        // A rejection ends the request; a grant is confirmed by pointerlockchange.
        (r as Promise<void>).then(undefined, () => { if (this.pending === mine) this.pending = null; });
      }
    } catch {
      if (this.pending === mine) this.pending = null;
      return false;
    }
    return true;
  }
}
