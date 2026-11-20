// Follow camera math (pure). Fixed viewing direction from +z toward −z, so W
// always means "up the screen". Duck uses a low eye line (Req 1.4).
import type { CharacterId } from "../core/types";
import type { Vec3 } from "./deriveView";

export const SWITCH_SECONDS = 0.4;

export interface Pose {
  eye: Vec3;
  target: Vec3;
}

/** Eye offset from the focus point, per character. */
export const CAMERA_OFFSET: Record<CharacterId, Vec3> = {
  duck: { x: 0, y: 0.75, z: 2.0 },
  child: { x: 0, y: 3.2, z: 4.6 },
  adult: { x: 0, y: 4.2, z: 6.0 },
};

export const OVERVIEW: Pose = { eye: { x: 18, y: 34, z: 24 }, target: { x: 18, y: 0, z: 2 } };

export function followPose(id: CharacterId, focus: Vec3): Pose {
  const o = CAMERA_OFFSET[id];
  const lookY = id === "duck" ? 0.25 : focus.y + 0.3;
  return {
    eye: { x: focus.x + o.x, y: focus.y + o.y, z: focus.z + o.z },
    target: { x: focus.x, y: lookY, z: focus.z - (id === "duck" ? 1.0 : 0) },
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

/** Smoothstep blend between two poses; t in seconds since the switch. */
export function blendPose(from: Pose, to: Pose, elapsed: number): Pose {
  const u = Math.min(Math.max(elapsed / SWITCH_SECONDS, 0), 1);
  const k = u * u * (3 - 2 * u);
  return { eye: lerp3(from.eye, to.eye, k), target: lerp3(from.target, to.target, k) };
}

/** Tracks switches and returns the pose to render each frame. */
export class FollowCamera {
  private current: Pose | null = null;
  private from: Pose | null = null;
  private elapsed = SWITCH_SECONDS;
  private lastId: CharacterId | null = null;
  private overview = false;

  toggleOverview(): void {
    this.startBlend();
    this.overview = !this.overview;
  }

  get isOverview(): boolean {
    return this.overview;
  }

  private startBlend(): void {
    this.from = this.current;
    this.elapsed = 0;
  }

  update(id: CharacterId, focus: Vec3, dt: number): Pose {
    if (this.lastId !== null && this.lastId !== id) this.startBlend();
    this.lastId = id;
    const goal = this.overview ? OVERVIEW : followPose(id, focus);
    this.elapsed += dt;
    this.current = this.from && this.elapsed < SWITCH_SECONDS ? blendPose(this.from, goal, this.elapsed) : goal;
    return this.current;
  }
}
