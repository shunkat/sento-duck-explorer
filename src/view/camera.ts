// Camera state: over-the-shoulder follow with orbit yaw (see
// .kiro/specs/shoulder-view), the auxiliary overview, and the switch blend.
import type { CharacterId } from "../core/types";
import { LEVEL, type Level } from "../level/layout";
import type { Vec3 } from "./deriveView";
import { CAMERA_PROFILE, clampPitch, type Obstacles, safeEye, shoulderPose } from "./shoulder";
import { compressedBodyOpacity, MobileCameraFraming } from "./mobileCamera";

export const SWITCH_SECONDS = 0.4;

export interface Pose {
  eye: Vec3;
  target: Vec3;
  /** Omitted on desktop, whose projection remains 55 degrees. */
  fov?: number;
  /** Touch-only active-body fade; the renderer defaults to fully opaque. */
  activeBodyOpacity?: number;
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
  private touch = false;
  private readonly framing = new MobileCameraFraming();
  private opacity = 1;
  private preferredDistance = 0;
  private fromDistance = 0;
  private lastTouchDistance: number | null = null;
  /** Horizontal view angle; 0 looks toward −Z. Movement input is rotated by it. */
  yaw = 0;
  /** Vertical look angle (rad, up is positive), bounded by `clampPitch`. View only. */
  pitch = 0;
  /** Actual canvas size, including late touch activation and orientation changes. */
  setViewport(width: number, height: number, touch: boolean): void {
    this.framing.setViewport(width, height, touch, !this.current || !touch);
    this.touch = touch;
    if (!touch) {
      this.opacity = 1;
      this.lastTouchDistance = null;
    }
  }
  /**
   * C cuts straight to or from the overview (no blend). The overview eye is
   * far above the roof, so any in-between pose would show the ceiling or a
   * wall from outside (shoulder-view Req 4.5).
   */
  toggleOverview(): void {
    this.from = null;
    this.elapsed = SWITCH_SECONDS;
    this.opacity = 1;
    this.preferredDistance = 0;
    this.lastTouchDistance = null;
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
    this.opacity = 1;
    this.preferredDistance = 0;
    this.lastTouchDistance = null;
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
    this.fromDistance = this.preferredDistance;
    this.elapsed = 0;
  }

  /**
   * The camera position follows the character; the yaw and pitch change only
   * by explicit input (orbit, tilt, recenter, checkpoint reset). A growth keeps
   * the view angles: only the body profile (distance, height, shoulder) blends.
   */
  update(id: CharacterId, focus: Vec3, dt: number, obstacles: Obstacles): Pose {
    const elapsed = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (this.lastId !== null && this.lastId !== id) this.startBlend();
    this.lastId = id;
    if (this.overview) {
      this.from = null;
      this.current = OVERVIEW;
      return this.current;
    }
    this.framing.update(elapsed);
    const profile = this.touch ? this.framing.profile(id) : undefined;
    const goal = shoulderPose(id, focus, this.yaw, obstacles, this.pitch, profile);
    this.elapsed += elapsed;
    this.preferredDistance = (profile ?? CAMERA_PROFILE[id]).dist;
    if (!this.from || this.elapsed >= SWITCH_SECONDS) {
      this.current = goal;
    } else {
      // Every in-between eye is made safe for the new character, including a
      // simultaneous resize. Resize does not restart this growth interpolation.
      const b = blendPose(this.from, goal, this.elapsed);
      this.current = { eye: safeEye({ x: focus.x, z: focus.z }, b.eye, obstacles), target: b.target };
      const u = this.elapsed / SWITCH_SECONDS;
      this.preferredDistance = lerp(this.fromDistance, this.preferredDistance, u * u * (3 - 2 * u));
    }
    if (this.touch) {
      let distance = Math.hypot(this.current.eye.x - focus.x, this.current.eye.z - focus.z);
      // Obstacle entry contracts immediately for safety; only recovery eases
      // outward. Work in focus-relative distance so walking and manual yaw do
      // not acquire an unwanted camera lag.
      if (this.lastTouchDistance !== null && distance > this.lastTouchDistance) {
        const recovered = Math.min(distance, this.lastTouchDistance + elapsed * this.preferredDistance / 0.3);
        const ratio = recovered / distance;
        this.current.eye = safeEye({ x: focus.x, z: focus.z }, {
          x: focus.x + (this.current.eye.x - focus.x) * ratio,
          y: this.current.eye.y,
          z: focus.z + (this.current.eye.z - focus.z) * ratio,
        }, obstacles);
        distance = Math.hypot(this.current.eye.x - focus.x, this.current.eye.z - focus.z);
      }
      this.lastTouchDistance = distance;
      const wanted = compressedBodyOpacity(distance, this.preferredDistance);
      // Linear bounded slew is continuous and returns to exactly one, avoiding
      // a permanently transparent material after leaving a wall or growing.
      const step = elapsed * 5;
      this.opacity += Math.sign(wanted - this.opacity) * Math.min(Math.abs(wanted - this.opacity), step);
      this.current.fov = this.framing.fov;
      this.current.activeBodyOpacity = this.opacity;
    }
    return this.current;
  }
}
