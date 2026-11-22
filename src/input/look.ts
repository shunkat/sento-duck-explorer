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
  /**
   * The one Pointer Lock request that has not finished. Neither a boundary nor
   * elapsed time clears it: the browser's events carry no request id, so a newer
   * request issued while this one is open would be mistaken for it. It finishes by:
   * - its grant (`pointerlockchange` to locked), for any API;
   * - Promise API: its own Promise rejection only (`pointerlockerror` is a notice);
   * - void API: `pointerlockerror`;
   * - a synchronous throw from `requestPointerLock`.
   * Every completion checks the request's own token, so an old completion never
   * ends a later request, even within the same epoch.
   */
  private inflight: LockRequest | null = null;
  private nextToken = 0;
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
  /** Boundary reset (modal, blur, rotation, outcome, restart): drops the drag; an open request stays open but its grant becomes stale. */
  invalidate(): void {
    this.epoch++;
    this.drag = null;
  }
  /** True while a request waits for its completion (new requests are not issued). */
  get requestOpen(): boolean { return this.inflight !== null; }
  private finish(token: number): void {
    if (this.inflight?.token === token) this.inflight = null;
  }
  /** The pointer id of a drag in progress (so the caller can release its DOM capture). */
  get dragPointer(): number | null { return this.drag?.id ?? null; }
  get locked(): boolean { return this.isLocked(); }
  /** The caller is about to leave the lock itself; the resulting change is not an Escape. */
  noteReleasing(): void { this.weReleased = true; }
  /** `pointerlockchange`. The caller exits the lock on "release" and opens settings on "pause". */
  onLockChange(locked: boolean): LockOutcome {
    if (locked) {
      // A grant completes the one open request. Only one exists at a time, so it is that one's.
      const req = this.inflight;
      const fresh = req !== null && req.epoch === this.epoch && this.captureAllowed;
      if (req) this.finish(req.token);
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
  /**
   * `pointerlockerror`. Ends the open request only for the void API. For a
   * Promise API the rejection decides; the event is a notice and never ends a
   * request (it may be the echo of an older, already rejected one). An error
   * during the `requestPointerLock` call itself is kept until the return value
   * shows which API it was. Nothing is retried by itself.
   */
  onLockError(): void {
    const req = this.inflight;
    if (!req) return;
    if (req.api === "calling") req.errorDuringCall = true;
    else if (req.api === "void") this.finish(req.token);
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
   * Ask for Pointer Lock. Never throws, never loops, never stacks: while an
   * earlier request is open no new one is issued, at any age and in any epoch.
   * Once it completed, the next deliberate click may request again.
   */
  requestLock(): boolean {
    if (!this.captureAllowed || this.inflight || this.isLocked() || this.settings().dragOnly) return false;
    const req: LockRequest = { token: ++this.nextToken, epoch: this.epoch, api: "calling", errorDuringCall: false };
    this.inflight = req;
    let r: Promise<void> | void;
    try {
      r = this.lockTarget.requestPointerLock();
    } catch {
      this.finish(req.token);
      return false;
    }
    if (r && typeof (r as Promise<void>).then === "function") {
      req.api = "promise";
      (r as Promise<void>).then(
        // Resolved without a lock (should not happen): end it so the next click can retry.
        () => { if (!this.isLocked()) this.finish(req.token); },
        () => this.finish(req.token),
      );
    } else {
      req.api = "void";
      if (req.errorDuringCall) this.finish(req.token);
    }
    return true;
  }
}
interface LockRequest {
  token: number;
  epoch: number;
  /** "calling" until `requestPointerLock` returns. */
  api: "calling" | "promise" | "void";
  /** `pointerlockerror` arrived synchronously inside the call. */
  errorDuringCall: boolean;
}
