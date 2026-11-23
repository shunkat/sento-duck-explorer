// Touch input state (DOM-free): analog stick, independent look pointer and the
// tap-toggled run. Every control is owned by one pointer id; an event from any
// other pointer never changes it, and control is never handed to another finger.
import type { Vec2 } from "../core/types";
import { ORBIT_DRAG_RATE } from "../view/shoulder";
/** Geometry of the touch layout (CSS px / fractions of the viewport width). */
export const MOVE_REGION_END = 0.48;
export const LOOK_REGION_START = 0.52;
export const STICK_RADIUS = 52;
export const STICK_DEADZONE = 0.14;
/** Touch look rate relative to a mouse pixel; view only. */
export const TOUCH_LOOK_RATE = ORBIT_DRAG_RATE * 1.15;
/** Which area of a viewport of width `w` a touch at `x` belongs to. */
export function regionAt(x: number, w: number): "move" | "look" | "gap" {
  if (w <= 0) return "gap";
  const f = x / w;
  if (f <= MOVE_REGION_END) return "move";
  if (f >= LOOK_REGION_START) return "look";
  return "gap";
}
/** Stick offset from its centre → move vector (x right, z down); length ≤ 1 with a dead zone. */
export function stickVector(dx: number, dy: number, radius = STICK_RADIUS): Vec2 {
  const len = Math.hypot(dx, dy);
  if (!Number.isFinite(len) || len === 0) return { x: 0, z: 0 };
  const m = Math.min(1, len / radius);
  if (m < STICK_DEADZONE) return { x: 0, z: 0 };
  // Rescale so the movement starts smoothly right after the dead zone.
  const scaled = (m - STICK_DEADZONE) / (1 - STICK_DEADZONE);
  return { x: (dx / len) * scaled, z: (dy / len) * scaled };
}
export class TouchInput {
  private stickId: number | null = null;
  private stickCentre: Vec2 = { x: 0, z: 0 };
  private vec: Vec2 = { x: 0, z: 0 };
  private lookId: number | null = null;
  private lookAt: Vec2 = { x: 0, z: 0 };
  private runOn = false;
  /** Run only turns itself off after a walk it covered has stopped. */
  private movedSinceRun = false;
  get run(): boolean { return this.runOn; }
  get stickOwner(): number | null { return this.stickId; }
  get lookOwner(): number | null { return this.lookId; }
  get stick(): Vec2 { return this.vec; }
  /** Start the stick with `id` (ignored while another finger owns it). Returns whether it was taken. */
  stickDown(id: number, centreX: number, centreY: number, x: number, y: number): boolean {
    if (this.stickId !== null) return false;
    this.stickId = id;
    this.stickCentre = { x: centreX, z: centreY };
    this.vec = stickVector(x - centreX, y - centreY);
    return true;
  }
  stickMove(id: number, x: number, y: number): void {
    if (id !== this.stickId) return;
    this.vec = stickVector(x - this.stickCentre.x, y - this.stickCentre.z);
  }
  lookDown(id: number, x: number, y: number): boolean {
    if (this.lookId !== null) return false;
    this.lookId = id;
    this.lookAt = { x, z: y };
    return true;
  }
  /** Drag the scene: view turns opposite to the owner's finger; other pointers are ignored. */
  lookMove(id: number, x: number, y: number): { yaw: number; pitch: number } | null {
    if (id !== this.lookId) return null;
    const dx = x - this.lookAt.x;
    const dy = y - this.lookAt.z;
    this.lookAt = { x, z: y };
    return { yaw: -dx * TOUCH_LOOK_RATE, pitch: dy * TOUCH_LOOK_RATE };
  }
  /** Pointer up / cancel / lost capture: release only what this pointer owns. */
  release(id: number): "stick" | "look" | null {
    if (id === this.stickId) {
      this.stickId = null;
      this.vec = { x: 0, z: 0 };
      return "stick";
    }
    if (id === this.lookId) {
      this.lookId = null;
      return "look";
    }
    return null;
  }
  /** Tap on the run button: toggles, never a hold. */
  toggleRun(): boolean {
    this.runOn = !this.runOn;
    this.movedSinceRun = false;
    return this.runOn;
  }
  setRun(on: boolean): void {
    this.runOn = on;
    this.movedSinceRun = false;
  }
  /** Blur, hide, rotation, any menu, outcome or restart: nothing stays held or running. */
  clear(): void {
    this.stickId = null;
    this.lookId = null;
    this.vec = { x: 0, z: 0 };
    this.runOn = false;
    this.movedSinceRun = false;
  }
  /** Per fixed tick: the stick move and run flag. Run never comes from stick magnitude. */
  sample(): { move: Vec2; run: boolean } {
    const moving = this.vec.x !== 0 || this.vec.z !== 0;
    if (moving) this.movedSinceRun = true;
    else if (this.runOn && this.movedSinceRun) {
      this.runOn = false;
      this.movedSinceRun = false;
    }
    return { move: { ...this.vec }, run: this.runOn && moving };
  }
}
