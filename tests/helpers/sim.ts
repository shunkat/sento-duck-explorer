// Input-only test driver. It reads state to decide which keys to press, but it
// never writes to the state: every change goes through `tick`.
import { expect } from "vitest";
import { createInitialState } from "../../src/core/initialState";
import { checkInvariants } from "../../src/core/invariants";
import { tick } from "../../src/core/tick";
import { type CharacterId, EMPTY_INPUT, type CoreState, type GameEvent, type GameState, type InputFrame, type Vec2 } from "../../src/core/types";
import { CHARACTER_RADIUS, LEVEL } from "../../src/level/layout";
import { circleOverlapsBox } from "../../src/sim/geometry";
import { shoreBoxes } from "../../src/sim/movement";

/** Outside the pond and Adult's arms, Duck's whole body is on the bath water (2026-11-20 user correction). */
export function duckOnWater(s: GameState | CoreState): string[] {
  const d = s.duck;
  if (d.carriedBy !== null || d.inPond) return [];
  const r = CHARACTER_RADIUS.duck;
  const onWater = LEVEL.duckWater.some((w) => d.pos.x >= w.minX && d.pos.x <= w.maxX && d.pos.z >= w.minZ && d.pos.z <= w.maxZ);
  const onShore = shoreBoxes(LEVEL.duckWater).some((b) => circleOverlapsBox(d.pos, r - 1e-3, b));
  return onWater && !onShore ? [] : [`duck off the water at ${JSON.stringify(d.pos)}`];
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
    const bad = [...checkInvariants(this.state), ...duckOnWater(this.state)];
    if (bad.length) throw new Error(`invariants violated at tick ${this.state.tickCount}: ${bad.join("; ")}`);
    return r.events;
  }

  idle(n = 1): void {
    for (let i = 0; i < n; i++) this.step();
  }

  get active(): CharacterId {
    return this.state.active;
  }

  pos(id: CharacterId = this.state.active): Vec2 {
    return this.state[id].pos;
  }

  /** Press the switch key until `id` is active (each press is one tick). */
  switchTo(id: CharacterId): void {
    for (let i = 0; i < 3 && this.state.active !== id; i++) this.step({ switchCharacter: true });
    expect(this.state.active).toBe(id);
  }

  /**
   * Hold the direction toward each waypoint until the active character is
   * within `tol`. Fails if the game ends or the tick budget runs out.
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
          throw new Error(`${this.active} stuck at ${JSON.stringify(p)} → ${JSON.stringify(target)} [${prompts}]`);
        }
        this.step({ move: { x: dx / d, z: dz / d }, run: opts.run ?? false });
      }
    }
  }

  /** Walk to within `reach` of a point (target shifted toward the current position). */
  approach(target: Vec2, reach: number, opts: { tol?: number } = {}): void {
    const p = this.pos();
    const d = Math.hypot(p.x - target.x, p.z - target.z);
    if (d <= reach) return;
    const k = (reach * 0.7) / d;
    this.walk([{ x: target.x + (p.x - target.x) * k, z: target.z + (p.z - target.z) * k }], opts);
  }

  press(key: keyof Omit<InputFrame, "move">): GameEvent[] {
    return this.step({ [key]: true });
  }

  expectPlaying(): void {
    expect(this.state.outcome).toEqual({ kind: "playing" });
  }

  owner(item: "coin" | "key" | "hat"): string {
    const o = this.state.items[item].owner;
    return `${o.kind}:${o.id}`;
  }
}
