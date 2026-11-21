// Input-only test driver. It reads state to decide which keys to press, but it
// never writes to the state: every change goes through `tick`.
import { expect } from "vitest";
import { createInitialState } from "../../src/core/initialState";
import { checkInvariants } from "../../src/core/invariants";
import { tick } from "../../src/core/tick";
import { EMPTY_INPUT, type CoreState, type GameEvent, type GameState, type InputFrame, type Vec2 } from "../../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../../src/level/layout";
import { circleOverlapsBox } from "../../src/sim/geometry";
import { shoreBoxes, wallsFor } from "../../src/sim/movement";

/** As Duck the whole body is on the water (never on the floor). */
export function duckOnWater(s: GameState | CoreState): string[] {
  const p = s.player;
  if (p.stage !== "duck") return [];
  const r = CHARACTER_RADIUS.duck;
  const onWater = LEVEL.duckWater.some((w) => p.pos.x >= w.minX && p.pos.x <= w.maxX && p.pos.z >= w.minZ && p.pos.z <= w.maxZ);
  const onShore = shoreBoxes(LEVEL.duckWater).some((b) => circleOverlapsBox(p.pos, r - 1e-3, b));
  return onWater && !onShore ? [] : [`duck off the water at ${JSON.stringify(p.pos)}`];
}

/** The player's body never overlaps a wall, fixture or closed door. */
export function playerClear(s: GameState | CoreState): string[] {
  const r = CHARACTER_RADIUS[s.player.stage];
  const hit = wallsFor(LEVEL, s.doors).find((w) => circleOverlapsBox(s.player.pos, r - 1e-3, w));
  return hit ? [`${s.player.stage} overlaps ${JSON.stringify(hit)} at ${JSON.stringify(s.player.pos)}`] : [];
}

export class Sim {
  state: GameState = createInitialState(LEVEL);
  log: GameEvent[] = [];
  lastEvents: GameEvent[] = [];

  step(input: Partial<InputFrame> = {}): GameEvent[] {
    const r = tick(this.state, { ...EMPTY_INPUT, ...input }, LEVEL);
    this.state = r.state;
    this.lastEvents = r.events;
    this.log.push(...r.events);
    const bad = [...checkInvariants(this.state), ...duckOnWater(this.state), ...playerClear(this.state)];
    if (bad.length) throw new Error(`invariants violated at tick ${this.state.tickCount}: ${bad.join("; ")}`);
    return r.events;
  }

  idle(n = 1): void {
    for (let i = 0; i < n; i++) this.step();
  }

  get stage() {
    return this.state.player.stage;
  }

  pos(): Vec2 {
    return this.state.player.pos;
  }

  /**
   * Hold the direction toward each waypoint until the player is within `tol`.
   * Fails if the game ends or the tick budget runs out.
   */
  walk(waypoints: Vec2[], opts: { run?: boolean; tol?: number; maxTicks?: number; allowEnd?: boolean } = {}): void {
    const tol = opts.tol ?? 0.06;
    for (const target of waypoints) {
      let ticks = 0;
      for (;;) {
        const p = this.pos();
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d <= tol) break;
        if (this.state.outcome.kind !== "playing") {
          if (opts.allowEnd) return;
          throw new Error(`game ended (${JSON.stringify(this.state.outcome)}) while walking to ${JSON.stringify(target)}`);
        }
        if (++ticks > (opts.maxTicks ?? 1500)) {
          const prompts = this.lastEvents.map((e) => JSON.stringify(e)).join(", ");
          throw new Error(`${this.stage} stuck at ${JSON.stringify(p)} → ${JSON.stringify(target)} [${prompts}]`);
        }
        this.step({ move: { x: dx / d, z: dz / d }, run: opts.run ?? false });
      }
    }
  }

  /** Hold one direction for `n` ticks (or until the game ends). */
  hold(move: Vec2, n: number, run = false): void {
    for (let i = 0; i < n && this.state.outcome.kind === "playing"; i++) this.step({ move, run });
  }

  press(key: keyof Omit<InputFrame, "move">): GameEvent[] {
    return this.step({ [key]: true });
  }

  expectPlaying(): void {
    expect(this.state.outcome).toEqual({ kind: "playing" });
  }
}
