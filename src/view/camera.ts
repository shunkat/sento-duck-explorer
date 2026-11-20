// Camera state: over-the-shoulder follow with orbit yaw (see
// .kiro/specs/shoulder-view), the auxiliary overview, and the switch blend.
import type { CharacterId } from "../core/types";
import type { Vec3 } from "./deriveView";
import { type Obstacles, shoulderPose } from "./shoulder";

export const SWITCH_SECONDS = 0.4;

export interface Pose {
  eye: Vec3;
  target: Vec3;
}

export const OVERVIEW: Pose = { eye: { x: 18, y: 34, z: 24 }, target: { x: 18, y: 0, z: 2 } };

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

  toggleOverview(): void {
    this.startBlend();
    this.overview = !this.overview;
  }

  get isOverview(): boolean {
    return this.overview;
  }

  /** Turn the view; ignored in the overview so the move mapping stays put. */
  orbit(delta: number): void {
    if (!this.overview) this.yaw += delta;
  }

  private startBlend(): void {
    this.from = this.current;
    this.elapsed = 0;
  }

  /**
   * `facingYaw` is the active character's facing; on a switch the camera turns
   * behind the new character (Req 1.3 of shoulder-view).
   */
  update(id: CharacterId, focus: Vec3, dt: number, facingYaw: number, obstacles: Obstacles): Pose {
    if (this.lastId !== null && this.lastId !== id) {
      this.startBlend();
      this.yaw = facingYaw;
    }
    this.lastId = id;
    const goal = this.overview ? OVERVIEW : shoulderPose(id, focus, this.yaw, obstacles);
    this.elapsed += dt;
    this.current = this.from && this.elapsed < SWITCH_SECONDS ? blendPose(this.from, goal, this.elapsed) : goal;
    return this.current;
  }
}
