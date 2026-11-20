import { DT, POND } from "../core/tuning";
import type { Vec2 } from "../core/types";
import { CHARACTER_RADIUS } from "../level/layout";
import { moveCircle } from "./collision";
import { type AABB, add, length, scale, sub } from "./geometry";
import { clampInput } from "./movement";

/**
 * One pond tick for Duck: current + steering input, damping, speed cap.
 * Call only while Duck is the active character (Req 1.8, 8.5).
 * Velocity is recomputed from the actual displacement so walls absorb it.
 */
export function stepPond(
  pos: Vec2,
  vel: Vec2,
  move: Vec2,
  walls: readonly AABB[],
): { pos: Vec2; vel: Vec2 } {
  const accel = add(POND.current, scale(clampInput(move), POND.inputAccel));
  let v = scale(add(vel, scale(accel, DT)), POND.damping);
  const speed = length(v);
  if (speed > POND.maxSpeed) v = scale(v, POND.maxSpeed / speed);
  const next = moveCircle(pos, scale(v, DT), CHARACTER_RADIUS.duck, walls);
  return { pos: next, vel: scale(sub(next, pos), 1 / DT) };
}
