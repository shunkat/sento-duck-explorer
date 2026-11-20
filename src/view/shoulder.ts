// Over-the-shoulder camera math (pure). See .kiro/specs/shoulder-view.
// Yaw 0 looks toward −Z: forward = (sin y, −cos y), right = (cos y, sin y).
import type { Object3D } from "three";
import type { CharacterId, CheckpointId, Vec2 } from "../core/types";
import type { Level } from "../level/layout";
import { wallsFor } from "../sim/movement";
import type { AABB } from "../sim/geometry";
import type { Pose } from "./camera";
import { BODY_HEIGHT, type Vec3, type View } from "./deriveView";

export interface CameraProfile {
  /** Distance behind the shoulder point (m). */
  dist: number;
  /** Eye height above the floor (m). */
  eye: number;
  /** Shoulder offset to the right (m). */
  side: number;
  /** Height of the look-at point (m). */
  look: number;
}

export const CAMERA_PROFILE: Record<CharacterId, CameraProfile> = {
  duck: { dist: 1.1, eye: 0.42, side: 0.22, look: 0.22 },
  child: { dist: 2.3, eye: 1.5, side: 0.42, look: 0.6 },
  adult: { dist: 2.6, eye: 2.0, side: 0.5, look: 0.9 },
};

/** Visual heights shared with the scene (m). */
export const WALL_HEIGHT = 2.6;
export const CEILING_Y = 2.7;
export const HOLE_LID_Y = 0.55;
/** Free space the camera keeps from any obstacle (m). */
export const CAMERA_MARGIN = 0.12;
/** How far ahead of the shoulder the camera looks (m). */
const LOOK_AHEAD = 4;
/** Orbit rates. */
export const ORBIT_KEY_RATE = 2.2; // rad/s while J / L is held
export const ORBIT_DRAG_RATE = 0.005; // rad per CSS px of horizontal drag

export const forwardOf = (yaw: number): Vec2 => ({ x: Math.sin(yaw), z: -Math.cos(yaw) });
export const rightOf = (yaw: number): Vec2 => ({ x: Math.cos(yaw), z: Math.sin(yaw) });

/** Yaw whose forward points along `d` (d must be non-zero). */
export const yawFromDirection = (d: Vec2): number => Math.atan2(d.x, -d.z);

/**
 * Rotate a screen-style move input (x = right, z = down, so W is z −1) into a
 * world move for the camera's yaw. Length is preserved.
 */
export function cameraRelativeMove(move: Vec2, yaw: number): Vec2 {
  if (move.x === 0 && move.z === 0) return move;
  const f = forwardOf(yaw);
  const r = rightOf(yaw);
  return { x: r.x * move.x - f.x * move.z, z: r.z * move.x - f.z * move.z };
}

/** three.js rotation.y that turns a model's +Z front toward `yaw`. */
export const modelRotationY = (yaw: number): number => Math.PI - yaw;

/**
 * Put `obj` (a child of the scene root) exactly on `socket`: world position
 * AND rotation, so an attached hat turns with the model's head (shoulder-view
 * Req 6.5). Scale is left as is.
 */
export function placeAtSocket(obj: Object3D, socket: Object3D): void {
  socket.updateWorldMatrix(true, false);
  socket.getWorldPosition(obj.position);
  socket.getWorldQuaternion(obj.quaternion);
}

/** Character groups sit at body center, while their GLB root is at the feet. */
export function placeCharacterAtSocket(obj: Object3D, socket: Object3D, centerToBottom: number): void {
  placeAtSocket(obj, socket);
  obj.translateY(centerToBottom);
}


/**
 * Walk from `from` toward `to` and stop before the first box (grown by
 * `margin`). Boxes that already contain `from` are ignored, so a start point
 * close to a wall never collapses the camera.
 */
export function clipSegment(from: Vec2, to: Vec2, boxes: readonly AABB[], margin = CAMERA_MARGIN): Vec2 {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  let tHit = 1;
  for (const b of boxes) {
    const minX = b.minX - margin;
    const maxX = b.maxX + margin;
    const minZ = b.minZ - margin;
    const maxZ = b.maxZ + margin;
    if (from.x > minX && from.x < maxX && from.z > minZ && from.z < maxZ) continue;
    let t0 = 0;
    let t1 = 1;
    let ok = true;
    for (const [p, d, lo, hi] of [
      [from.x, dx, minX, maxX],
      [from.z, dz, minZ, maxZ],
    ] as const) {
      if (Math.abs(d) < 1e-12) {
        if (p <= lo || p >= hi) ok = false;
        continue;
      }
      let a = (lo - p) / d;
      let c = (hi - p) / d;
      if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a);
      t1 = Math.min(t1, c);
      if (t0 >= t1) ok = false;
    }
    if (ok && t0 < tHit) tHit = t0;
  }
  const t = Math.max(0, tHit - (tHit < 1 ? 1e-3 : 0));
  return { x: from.x + dx * t, z: from.z + dz * t };
}

export interface Obstacles {
  boxes: readonly AABB[];
  /** The NarrowHole corridor; inside it the eye stays under the lid. */
  hole: AABB;
}

export const obstaclesFor = (level: Level, saunaDoor: "locked" | "unlocked"): Obstacles => ({
  boxes: wallsFor(level, saunaDoor),
  hole: level.narrowHole.box,
});

const inBox = (b: AABB, p: Vec2) => p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

/** Camera pose behind and right of the character at `focus`, clipped by obstacles. */
export function shoulderPose(id: CharacterId, focus: Vec3, yaw: number, obs: Obstacles): Pose {
  const p = CAMERA_PROFILE[id];
  const f = forwardOf(yaw);
  const r = rightOf(yaw);
  const base = { x: focus.x, z: focus.z };
  const shoulder = clipSegment(base, { x: base.x + r.x * p.side, z: base.z + r.z * p.side }, obs.boxes);
  const back = clipSegment(shoulder, { x: shoulder.x - f.x * p.dist, z: shoulder.z - f.z * p.dist }, obs.boxes);
  const footHeight = focus.y - BODY_HEIGHT[id] / 2;
  const eye = safeEye(base, { x: back.x, y: p.eye + footHeight, z: back.z }, obs);
  const lookY = Math.min(p.look + footHeight, eye.y);
  return {
    eye,
    target: { x: shoulder.x + f.x * LOOK_AHEAD, y: lookY, z: shoulder.z + f.z * LOOK_AHEAD },
  };
}

/**
 * Make an eye position safe for the character standing at `base`: a clear
 * line from the character to the eye (so no wall in between), below the
 * ceiling, and under the NarrowHole lid when inside it. Used for every pose
 * the camera returns, including blended ones.
 */
export function safeEye(base: Vec2, eye: Vec3, obs: Obstacles): Vec3 {
  const e2 = clipSegment(base, { x: eye.x, z: eye.z }, obs.boxes);
  let y = Math.min(eye.y, CEILING_Y - 0.15);
  if (inBox(obs.hole, e2) || inBox(obs.hole, base)) y = Math.min(y, HOLE_LID_Y - 0.1);
  return { x: e2.x, y, z: e2.z };
}

/** View-only facing from movement between frames. A carried Duck faces like Adult. */
export class FacingTracker {
  private yaws: Record<CharacterId, number> = { duck: 0, child: 0, adult: 0 };
  private last: Partial<Record<CharacterId, Vec2>> = {};
  private movedNow: Record<CharacterId, boolean> = { duck: false, child: false, adult: false };

  update(view: View): void {
    for (const id of ["child", "adult", "duck"] as const) {
      const c = view.characters[id];
      const prev = this.last[id];
      this.last[id] = { x: c.pos.x, z: c.pos.z };
      this.movedNow[id] = false;
      if (id === "duck" && c.carried) {
        this.yaws.duck = this.yaws.adult;
        continue;
      }
      if (!prev) continue;
      const d = { x: c.pos.x - prev.x, z: c.pos.z - prev.z };
      const len = Math.hypot(d.x, d.z);
      if (len > 1e-4 && len < 0.5) {
        this.yaws[id] = yawFromDirection(d);
        this.movedNow[id] = true;
      }
    }
  }

  yaw(id: CharacterId): number {
    return this.yaws[id];
  }

  /** After a checkpoint load or a new game: everyone faces `yaw`; the position jump is not read as movement. */
  lookAlong(yaw: number): void {
    this.yaws = { duck: yaw, child: yaw, adult: yaw };
    this.last = {};
    this.movedNow = { duck: false, child: false, adult: false };
  }

  /** True if the character moved in the last update. */
  moving(id: CharacterId): boolean {
    return this.movedNow[id];
  }
}

/**
 * View yaw after a checkpoint load, per checkpoint (view only). Start looks
 * toward the NarrowHole (−X) so Duck's first view is not filled by the humans
 * standing in front of it (review D-1); the others look toward the next goal.
 */
export const CHECKPOINT_VIEW_YAW: Record<CheckpointId, number> = {
  start: -Math.PI / 2,
  paidReturned: Math.PI,
  hatEquipped: Math.PI / 2,
  duckInPond: Math.PI / 2,
};

/**
 * Opacity for a non-active character this far (m, horizontal) from the
 * camera eye: a body right next to the lens fades so it does not fill the
 * view (review D-1).
 */
export function nearCameraOpacity(dist: number): number {
  const near = 0.6;
  const far = 1.3;
  if (dist <= near) return 0.15;
  if (dist >= far) return 1;
  return 0.15 + ((dist - near) / (far - near)) * 0.85;
}

/** Opacity of a body that stands between the camera and the controlled character (review N-6). */
export const OCCLUDER_OPACITY = 0.3;

/**
 * Opacity for a non-active character at `other` (radius `r`): faded when it
 * is next to the lens, or when it stands on the line from the eye to the
 * controlled character at `active` and would hide it.
 */
export function bodyOpacity(eye: Vec2, active: Vec2, other: Vec2, r: number): number {
  const near = nearCameraOpacity(Math.hypot(other.x - eye.x, other.z - eye.z));
  const dx = active.x - eye.x;
  const dz = active.z - eye.z;
  const len2 = dx * dx + dz * dz;
  if (len2 < 1e-9) return near;
  const t = ((other.x - eye.x) * dx + (other.z - eye.z) * dz) / len2;
  if (t <= 0 || t >= 1) return near;
  const px = eye.x + dx * t - other.x;
  const pz = eye.z + dz * t - other.z;
  const blocks = Math.hypot(px, pz) < r + 0.15;
  return blocks ? Math.min(near, OCCLUDER_OPACITY) : near;
}

/** Camera follow: after manual orbit, wait this long before easing back (s). */
export const FOLLOW_HOLD_SECONDS = 1.0;
/** Ease rate toward the heading (1/s); about 95 % of the gap closes in 1 s. */
export const FOLLOW_RATE = 3.0;
/** While moving, do not follow a heading more than this far from the view (walking toward the camera). */
export const FOLLOW_MAX_TURN = (100 * Math.PI) / 180;

/** Signed smallest angle from `a` to `b`, in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * While the character moves, ease the camera yaw back behind its heading
 * (shoulder-view Req 1.5). Manual orbit wins for FOLLOW_HOLD_SECONDS after the
 * last orbit input. Standing still keeps the yaw, so the player can look
 * around a corner. Walking toward the camera (more than FOLLOW_MAX_TURN off)
 * also keeps it, so S does not spin the view.
 */
export function followYaw(yaw: number, heading: number, moving: boolean, sinceOrbit: number, dt: number): number {
  if (!moving || sinceOrbit < FOLLOW_HOLD_SECONDS) return yaw;
  const d = angleDiff(yaw, heading);
  if (Math.abs(d) > FOLLOW_MAX_TURN) return yaw;
  return yaw + d * (1 - Math.exp(-FOLLOW_RATE * dt));
}
