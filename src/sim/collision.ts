import type { Vec2 } from "../core/types";
import { type AABB, add, circleOverlapsBox, closestPoint, length, scale, sub } from "./geometry";

const EPS = 1e-6;

/**
 * Project a circle out of overlapping boxes, with bounded work. A later box
 * can push it back into an earlier one at a tight corner; moveCircle checks
 * the complete result before accepting it.
 */
export function resolveCircle(center: Vec2, radius: number, walls: readonly AABB[]): Vec2 {
  let p = center;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const w of walls) {
      const c = closestPoint(w, p);
      const d = sub(p, c);
      const dist = length(d);
      if (dist >= radius) continue;
      // Push just outside contact so rounding cannot leave a tiny overlap.
      // This is an outward numerical margin, not a reduced collision radius.
      const separation = radius + EPS;
      if (dist > EPS) {
        // Outside the box but overlapping: push along the separation normal.
        p = add(c, scale(d, separation / dist));
      } else {
        // Center inside the box: push out through the nearest face.
        const left = p.x - w.minX;
        const right = w.maxX - p.x;
        const down = p.z - w.minZ;
        const up = w.maxZ - p.z;
        const m = Math.min(left, right, down, up);
        if (m === left) p = { x: w.minX - separation, z: p.z };
        else if (m === right) p = { x: w.maxX + separation, z: p.z };
        else if (m === down) p = { x: p.x, z: w.minZ - separation };
        else p = { x: p.x, z: w.maxZ + separation };
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
  const clear = (point: Vec2) => !walls.some(w => circleOverlapsBox(point, radius, w));
  let p = from;
  for (let i = 0; i < steps; i++) {
    const desired = add(p, step);
    const next = resolveCircle(desired, radius, walls);
    if (clear(next)) {
      p = next;
      continue;
    }
    // Alternating corner projections may not converge in four passes,
    // especially when the attempted gap is narrower than the body. Try the
    // two tangential movement components, then retain the last valid pose.
    // Every accepted result must clear all walls; work stays bounded at three
    // projections per substep, with no unbounded convergence loop.
    let best = p;
    let nearest = length(sub(p, desired));
    for (const slide of [{ x: step.x, z: 0 }, { x: 0, z: step.z }]) {
      if (slide.x === 0 && slide.z === 0) continue;
      const candidate = resolveCircle(add(p, slide), radius, walls);
      const distance = length(sub(candidate, desired));
      if (distance < nearest && clear(candidate)) {
        best = candidate;
        nearest = distance;
      }
    }
    p = best;
  }
  return p;
}
