// Camera state: over-the-shoulder follow with orbit yaw (see
// .kiro/specs/shoulder-view), the auxiliary overview, and the switch blend.
import type { CharacterId } from "../core/types";
import { LEVEL, type Level } from "../level/layout";
import type { Vec3 } from "./deriveView";
import { clampPitch, type Obstacles, safeEye, shoulderPose } from "./shoulder";

export const SWITCH_SECONDS = 0.4;

export interface Pose {
  eye: Vec3;
  target: Vec3;
}

/**
 * Fixed map view over the whole level: centred on the zones' bounds, looking
 * down at the same angle as before (height 34 and 22 m south for a 43 m wide
 * map), scaled to the level's width.
 */
export function overviewPose(level: Level): Pose {
  const bs = level.zones.map((z) => z.box);
  const minX = Math.min(...bs.map((b) => b.minX));
  const maxX = Math.max(...bs.map((b) => b.maxX));
  const minZ = Math.min(...bs.map((b) => b.minZ));
  const maxZ = Math.max(...bs.map((b) => b.maxZ));
  const k = Math.max(maxX - minX, (maxZ - minZ) * 1.6) / 43;
  const target = { x: (minX + maxX) / 2, y: 0, z: (minZ + maxZ) / 2 };
  return { eye: { x: target.x, y: 34 * k, z: target.z + 22 * k }, target };
}

export const OVERVIEW: Pose = overviewPose(LEVEL);

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

/** Smoothstep blend between two poses; t in seconds since the switch. */
export function blendPose(from: Pose, to: Pose, elapsed: number): Pose {
  const u = Math.min(Math.max(elapsed / SWITCH_SECONDS, 0), 1);
  const k = u * u * (3 - 2 * u);
  return { eye: lerp3(from.eye, to.eye, k), target: lerp3(from.target, to.target, k) };
}

/** Tracks yaw, switches and the overview, and returns the pose to render each frame. */
export class FollowCamera {
  private current: Pose | null = null;
  private from: Pose | null = null;
  private elapsed = SWITCH_SECONDS;
  private lastId: CharacterId | null = null;
  private overview = false;
  /** Horizontal view angle; 0 looks toward −Z. Movement input is rotated by it. */
  yaw = 0;
  /** Vertical look angle (rad, up is positive), bounded by `clampPitch`. View only. */
  pitch = 0;
  /**
   * C cuts straight to or from the overview (no blend). The overview eye is
   * far above the roof, so any in-between pose would show the ceiling or a
   * wall from outside (shoulder-view Req 4.5).
   */
  toggleOverview(): void {
    this.from = null;
    this.elapsed = SWITCH_SECONDS;
    this.overview = !this.overview;
  }

  get isOverview(): boolean {
    return this.overview;
  }

  /**
   * Yaw that WASD and the touch stick map against: always the current
   * manually controlled view yaw (0 in the fixed overview). Releasing and
   * pressing a key never changes the direction, and the camera never turns by
   * itself, so there is no feedback loop between walking and the view.
   */
  get moveYaw(): number {
    return this.overview ? 0 : this.yaw;
  }
  /** After a checkpoint load or a new game: drop stale view state and look along `yaw`. */
  lookAlong(yaw: number): void {
    this.yaw = yaw;
    this.pitch = 0;
    this.from = null;
    this.current = null;
    this.lastId = null;
    this.elapsed = SWITCH_SECONDS;
  }
  /** Turn the view left/right; ignored in the overview so the move mapping stays put. */
  orbit(delta: number): void {
    if (this.overview || delta === 0) return;
    this.yaw += delta;
  }
  /** Look up (positive) or down within the bounded range. */
  tilt(delta: number): void {
    if (this.overview || delta === 0) return;
    this.pitch = clampPitch(this.pitch + delta);
  }
  /** Explicit recenter: look along `yaw` (the character's facing) and level the pitch. */
  recenter(yaw: number): void {
    if (this.overview) return;
    this.yaw = yaw;
    this.pitch = 0;
  }
  private startBlend(): void {
    this.from = this.current;
    this.elapsed = 0;
  }

  /**
   * The camera position follows the character; the yaw and pitch change only
   * by explicit input (orbit, tilt, recenter, checkpoint reset). A growth keeps
   * the view angles: only the body profile (distance, height, shoulder) blends.
   */
  update(id: CharacterId, focus: Vec3, dt: number, obstacles: Obstacles): Pose {
    if (this.lastId !== null && this.lastId !== id) this.startBlend();
    this.lastId = id;
    if (this.overview) {
      this.from = null;
      this.current = OVERVIEW;
      return this.current;
    }
    const goal = shoulderPose(id, focus, this.yaw, obstacles, this.pitch);
    this.elapsed += dt;
    if (!this.from || this.elapsed >= SWITCH_SECONDS) {
      this.current = goal;
      return goal;
    }
    // Switch blend: every in-between eye is made safe for the new character
    // (clear line to it, below the ceiling), so no frame looks through a wall.
    const b = blendPose(this.from, goal, this.elapsed);
    this.current = { eye: safeEye({ x: focus.x, z: focus.z }, b.eye, obstacles), target: b.target };
    return this.current;
  }
}
