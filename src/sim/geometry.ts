import type { Vec2 } from "../core/types";

/** Axis-aligned box on the XZ plane. */
export interface AABB {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export const vec = (x: number, z: number): Vec2 => ({ x, z });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, z: a.z * s });
export const length = (a: Vec2): number => Math.hypot(a.x, a.z);
export const distance = (a: Vec2, b: Vec2): number => length(sub(a, b));

export const box = (minX: number, minZ: number, maxX: number, maxZ: number): AABB => ({
  minX: Math.min(minX, maxX),
  minZ: Math.min(minZ, maxZ),
  maxX: Math.max(minX, maxX),
  maxZ: Math.max(minZ, maxZ),
});

export const containsPoint = (b: AABB, p: Vec2): boolean =>
  p.x >= b.minX && p.x <= b.maxX && p.z >= b.minZ && p.z <= b.maxZ;

/** Closest point on the box to `p`. */
export const closestPoint = (b: AABB, p: Vec2): Vec2 => ({
  x: Math.min(Math.max(p.x, b.minX), b.maxX),
  z: Math.min(Math.max(p.z, b.minZ), b.maxZ),
});

export const circleOverlapsBox = (center: Vec2, radius: number, b: AABB): boolean =>
  distance(closestPoint(b, center), center) < radius;
