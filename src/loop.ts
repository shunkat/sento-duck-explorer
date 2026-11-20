// Fixed 60 Hz stepping with an accumulator. Pure apart from the frame source.
import { tick } from "./core/tick";
import { DT } from "./core/tuning";
import type { GameEvent, GameState, InputFrame } from "./core/types";
import type { Level } from "./level/layout";

export const MAX_TICKS_PER_FRAME = 5;
/** Longest real-time gap accepted for one frame (e.g. after a background tab). */
export const MAX_FRAME_SECONDS = 0.25;

export interface LoopResult {
  state: GameState;
  accumulator: number;
  events: GameEvent[];
  ticks: number;
}

/**
 * Advance the game by the elapsed real time. `takeFrame` is called once per
 * logic tick, so single presses reach exactly one tick. Leftover time beyond
 * MAX_TICKS_PER_FRAME is dropped so movement never jumps through walls.
 */
export function advance(
  state: GameState,
  accumulator: number,
  frameSeconds: number,
  takeFrame: (s: GameState) => InputFrame,
  level: Level,
): LoopResult {
  let acc = accumulator + Math.min(Math.max(frameSeconds, 0), MAX_FRAME_SECONDS);
  let s = state;
  const events: GameEvent[] = [];
  let ticks = 0;
  while (acc >= DT && ticks < MAX_TICKS_PER_FRAME) {
    const r = tick(s, takeFrame(s), level);
    s = r.state;
    events.push(...r.events);
    acc -= DT;
    ticks++;
  }
  if (ticks === MAX_TICKS_PER_FRAME && acc >= DT) acc = 0;
  return { state: s, accumulator: acc, events, ticks };
}
