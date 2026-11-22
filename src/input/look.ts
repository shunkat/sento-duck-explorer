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
export class MouseLook {
  /** False while a modal is open, the window is blurred or the lock is unwanted. */
  private captureAllowed = true;
  /** One request at a time; a failed or delayed request is never retried by itself. */
  private requesting = false;
  private drag: { id: number; x: number; y: number; startX: number; startY: number; startT: number; moved: number; button: number } | null = null;
  constructor(private sink: LookSink, private settings: () => ControlValues, private lockTarget: LockTarget,
    private isLocked: () => boolean = () => false) {}
  /** Allow or forbid capture. A grant that arrives later is released by the caller (see main). */
  setCaptureAllowed(allowed: boolean): void {
    this.captureAllowed = allowed;
    if (!allowed) this.drag = null;
  }
  get locked(): boolean { return this.isLocked(); }
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
  /** Ask for Pointer Lock once. Never throws; never loops; ignores a late result after a modal/blur. */
  requestLock(): boolean {
    if (!this.captureAllowed || this.requesting || this.isLocked() || this.settings().dragOnly) return false;
    this.requesting = true;
    const done = () => { this.requesting = false; };
    try {
      const r = this.lockTarget.requestPointerLock();
      if (r && typeof (r as Promise<void>).then === "function") {
        (r as Promise<void>).then(done, done);
      } else {
        done();
      }
    } catch {
      done();
      return false;
    }
    return true;
  }
}
