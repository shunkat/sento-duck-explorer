import { describe, expect, it } from "vitest";
import { interactHint, interactTarget } from "../src/core/actions";
import { nearbyHints } from "../src/core/guide";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { EMPTY_INPUT, type GameState, type Vec2 } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import { zoneAt } from "../src/sim/zones";

// Deliberate state fixtures isolate reach and availability; no browser play claim.
function human(pos: Vec2, extra: Partial<GameState["player"]> = {}): GameState {
  const s = createInitialState(LEVEL);
  s.milk = { milk1: "collected", milk2: "collected", milk3: "collected", milk4: "collected" };
  Object.assign(s.player, { stage: "adult", pos, zone: zoneAt(LEVEL, pos)!, wet: "wet", towel: "head" }, extra);
  return s;
}
const interact = (s: GameState) => tick(s, { ...EMPTY_INPUT, interact: true }, LEVEL);

describe("place-specific control hints", () => {
  it("starts without a room description, walkthrough or controls that Duck cannot use", () => {
    expect(nearbyHints(createInitialState(LEVEL), LEVEL)).toEqual([]);
  });

  it("shows milk only within reach and for the matching stage; a rejected bottle does not fall through to towel help", () => {
    const s = createInitialState(LEVEL);
    s.player.pos = { ...LEVEL.nodes.milk1 };
    s.player.zone = zoneAt(LEVEL, s.player.pos)!;
    expect(interactHint(s, LEVEL)).toContain("1/2");
    expect(nearbyHints(s, LEVEL)).toEqual([]); // the E action is shown on its target
    expect(interact(s).state.player.stage).toBe("duck");
    s.player.stage = "adult";
    s.player.towel = "head";
    expect(interactHint(s, LEVEL)).toBeNull();
    expect(interact(s).events.some(e => e.kind === "rejected")).toBe(true);
  });

  it("matches drying and dressing priority and updates after each action", () => {
    let s = human(LEVEL.waypoints.bathDoorDry);
    expect(interactHint(s, LEVEL)).toBe("タオルで体を拭く");
    expect(interactTarget(s, LEVEL)).toMatchObject({ kind: "dry" });
    s = interact(s).state;
    expect(s.player.wet).toBe("dry");
    expect(interactHint(s, LEVEL)).toBeNull(); // no towel fallback
    expect(interactTarget(s, LEVEL)).toBeNull();
    s = human({ x: LEVEL.locker.x + .6, z: LEVEL.locker.z }, { wet: "dry" });
    expect(interactHint(s, LEVEL)).toBe("服を着る");
    s = interact(s).state;
    expect(interactHint(s, LEVEL)).toBe("服を脱ぐ");
    s.player.pos = { ...LEVEL.waypoints.bathMid };
    s.player.zone = "bath";
    expect(interactHint(s, LEVEL)).toBeNull();
  });

  it("offers Q only for a human holding a towel in water", () => {
    const s = human(LEVEL.growthSpots.milk1, { towel: "held" });
    expect(nearbyHints(s, LEVEL)).toContain("Q: タオルを湯につける");
    expect(tick(s, { ...EMPTY_INPUT, dipTowel: true }, LEVEL).state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
    s.player.towel = "head";
    expect(nearbyHints(s, LEVEL).some(h => h.startsWith("Q:"))).toBe(false);
    s.player.towel = "held";
    s.player.pos = { ...LEVEL.waypoints.bathMid };
    s.player.zone = "bath";
    expect(nearbyHints(s, LEVEL).some(h => h.startsWith("Q:"))).toBe(false);
  });

  it("shows sauna actions only in the sauna and push only within an NPC's reach", () => {
    const n = LEVEL.npcs[0]!;
    const s = human({ x: n.minX - .4, z: (n.minZ + n.maxZ) / 2 }, { wet: "dry" });
    expect(nearbyHints(s, LEVEL)).toContain("V: 大声を出す");
    expect(nearbyHints(s, LEVEL)).toContain("F: 押す");
    expect(tick(s, { ...EMPTY_INPUT, push: true }, LEVEL).state.outcome).toEqual({ kind: "gameOver", reason: "F7" });
    const entrance = LEVEL.zones.find(z => z.id === "sauna_entry")!.box;
    s.player.pos = { x: entrance.minX + .4, z: entrance.minZ + .4 };
    s.player.zone = "sauna_entry";
    expect(nearbyHints(s, LEVEL)).toContain("V: 大声を出す");
    expect(nearbyHints(s, LEVEL).some(h => h.startsWith("F:"))).toBe(false);
    s.player.pos = { ...LEVEL.waypoints.bathMid };
    s.player.zone = "bath";
    expect(nearbyHints(s, LEVEL).some(h => /^[VF]:/.test(h))).toBe(false);
  });

  it("does not show actionable keys once play ends", () => {
    const s = human(LEVEL.waypoints.bathDoorDry);
    for (const outcome of [{ kind: "cleared" }, { kind: "gameOver", reason: "F2" }] as const) {
      s.outcome = outcome;
      expect(nearbyHints(s, LEVEL)).toEqual([]);
      expect(interactHint(s, LEVEL)).toBeNull();
    }
  });
});
