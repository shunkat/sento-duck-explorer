import type { Vec2 } from "../core/types";
import { type AABB, add, closestPoint, length, scale, sub } from "./geometry";

const EPS = 1e-6;

/**
 * Push a circle out of every overlapping box. Repeats a few passes so that
 * corners and narrow openings between two boxes resolve stably.
 */
export function resolveCircle(center: Vec2, radius: number, walls: readonly AABB[]): Vec2 {
  let p = center;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const w of walls) {
      const c = closestPoint(w, p);
      const d = sub(p, c);
      const dist = length(d);
      if (dist >= radius - EPS) continue;
      if (dist > EPS) {
        // Outside the box but overlapping: push along the separation normal.
        p = add(c, scale(d, radius / dist));
      } else {
        // Center inside the box: push out through the nearest face.
        const left = p.x - w.minX;
        const right = w.maxX - p.x;
        const down = p.z - w.minZ;
        const up = w.maxZ - p.z;
        const m = Math.min(left, right, down, up);
        if (m === left) p = { x: w.minX - radius, z: p.z };
        else if (m === right) p = { x: w.maxX + radius, z: p.z };
        else if (m === down) p = { x: p.x, z: w.minZ - radius };
        else p = { x: p.x, z: w.maxZ + radius };
      }
      moved = true;
    }
    if (!moved) break;
  }
  return p;
}

/**
 * Move a circle by `delta`, in sub-steps no longer than radius / 2, resolving
 * collisions after each step so it cannot tunnel through thin walls.
 */
export function moveCircle(
  from: Vec2,
  delta: Vec2,
  radius: number,
  walls: readonly AABB[],
): Vec2 {
  const dist = length(delta);
  const steps = Math.max(1, Math.ceil(dist / (radius / 2)));
  const step = scale(delta, 1 / steps);
  let p = from;
  for (let i = 0; i < steps; i++) {
    p = resolveCircle(add(p, step), radius, walls);
  }
  return p;
}
