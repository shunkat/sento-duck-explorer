import { describe, expect, it } from "vitest";
import { highDoorInReach, interactHint, interactTarget, segmentBlocked } from "../src/core/actions";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { REACH } from "../src/core/tuning";
import { EMPTY_INPUT, type GameState, type Vec2 } from "../src/core/types";
import { LEVEL } from "../src/level/layout";
import { distance } from "../src/sim/geometry";
import { zoneAt } from "../src/sim/zones";
import { choosePromptPlace, labelRect, ndcToScreen, rectInside } from "../src/view/targetPlacement";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";
const W = LEVEL.waypoints;
function adult(pos: Vec2, extra: Partial<GameState["player"]> = {}): GameState {
  const s = createInitialState(LEVEL);
  s.milk = { milk1: "collected", milk2: "collected" };
  Object.assign(s.player, { stage: "adult", pos, zone: zoneAt(LEVEL, pos)!, wet: "dry", clothing: "unclothed", towel: "head" }, extra);
  return s;
}
describe("E target selection is one list for hint, target and action", () => {
  it("names the same thing the action does: milk, drying, clothing, high door; nothing else", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    const duck = new Sim();
    duck.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    const t = interactTarget(duck.state, LEVEL)!;
    expect(t).toMatchObject({ kind: "milk", id: "milk1", label: interactHint(duck.state, LEVEL) });
    const dry = adult(W.bathDoorDry, { wet: "wet" });
    expect(interactTarget(dry, LEVEL)).toMatchObject({ kind: "dry", label: "タオルで体を拭く" });
    const locker = adult({ x: LEVEL.locker.x + 0.6, z: LEVEL.locker.z });
    expect(interactTarget(locker, LEVEL)).toMatchObject({ kind: "clothing", label: "服を着る" });
    const gate = adult(W.gateIn);
    expect(interactTarget(gate, LEVEL)).toMatchObject({ kind: "highDoor", id: "kidsGate" });
  });
  it("a wrong-stage bottle and an unreachable handle are not targets, but E still rejects them", () => {
    const s = createInitialState(LEVEL);
    Object.assign(s.player, { stage: "adult", pos: { ...LEVEL.nodes.milk1 }, zone: zoneAt(LEVEL, LEVEL.nodes.milk1)! });
    expect(interactTarget(s, LEVEL)).toBeNull();
    expect(tick(s, { ...EMPTY_INPUT, interact: true }, LEVEL).events.some((e) => e.kind === "rejected")).toBe(true);
    const child = adult(W.gateIn, { stage: "child" });
    expect(interactTarget(child, LEVEL)).toBeNull();
    const r = tick(child, { ...EMPTY_INPUT, interact: true }, LEVEL);
    expect(r.state.doors.kidsGate).toBe("closed");
    expect(r.events).toContainEqual({ kind: "rejected", reason: "取っ手が高くて届かない（大人になったら開けられる）" });
  });
  it("without a target E never changes the towel; T/the menu does, for humans only", () => {
    for (const towel of ["head", "held"] as const) {
      const s = adult(W.bathMid, { towel });
      expect(interactTarget(s, LEVEL)).toBeNull();
      const e = tick(s, { ...EMPTY_INPUT, interact: true }, LEVEL);
      expect(e.state.player.towel).toBe(towel);
      expect(e.events).toContainEqual({ kind: "rejected", reason: "ここではできることがありません" });
      expect(tick(s, { ...EMPTY_INPUT, toggleTowel: true }, LEVEL).state.player.towel).toBe(towel === "head" ? "held" : "head");
    }
    const duck = createInitialState(LEVEL);
    expect(tick(duck, { ...EMPTY_INPUT, toggleTowel: true }, LEVEL).state.player.towel).toBe("none");
  });
  it("toggling the towel does not dry, dress, grow or clear anything", () => {
    const s = adult(W.bathDoorDry, { wet: "wet", towel: "head" });
    const r = tick(s, { ...EMPTY_INPUT, toggleTowel: true }, LEVEL).state;
    expect(r.player).toMatchObject({ wet: "wet", clothing: "unclothed", towel: "held", stage: "adult" });
    expect(r.milk).toEqual(s.milk);
  });
  it("only an available target exists after the game ends", () => {
    const s = adult(W.gateIn);
    s.outcome = { kind: "gameOver", reason: "F2" };
    expect(interactTarget(s, LEVEL)).toBeNull();
  });
});
describe("high handle line of sight", () => {
  it("a handle is not hidden by its own closed panel, although the straight line crosses it", () => {
    const g = LEVEL.highDoors.kidsGate;
    const s = adult(W.gateIn);
    expect(segmentBlocked(s.player.pos, g.handle, [g.blocker])).toBe(true); // the panel is in the way of the line
    expect(highDoorInReach(s, LEVEL)).toBe("kidsGate");
    expect(tick(s, { ...EMPTY_INPUT, interact: true }, LEVEL).state.doors.kidsGate).toBe("open");
  });
  it("another wall between the player and the handle rejects the action, though it is within reach", () => {
    const g = LEVEL.highDoors.kidsGate;
    const s = adult(W.gateIn);
    const between = { minX: g.handle.x - 1, maxX: g.handle.x + 1, minZ: s.player.pos.z - 0.3, maxZ: s.player.pos.z - 0.25 };
    expect(distance(s.player.pos, g.handle)).toBeLessThanOrEqual(REACH.handle);
    expect(between.minZ).toBeGreaterThan(g.blocker.maxZ); // a separate wall, not the door's own
    const walled = { ...LEVEL, walls: [...LEVEL.walls, between] };
    expect(highDoorInReach(s, walled)).toBeNull();
    expect(interactTarget(s, walled)).toBeNull();
    const r = tick(s, { ...EMPTY_INPUT, interact: true }, walled);
    expect(r.state.doors.kidsGate).toBe("closed");
    expect(r.events.some((e) => e.kind === "doorOpened")).toBe(false);
  });
});
describe("target text placement", () => {
  const viewport = { w: 390, h: 844 };
  const margin = { top: 48, right: 12, bottom: 64, left: 12 };
  it("checks the whole rectangle, not only the anchor", () => {
    const anchorInside = { x: 20, y: 300 };
    const wide = labelRect(anchorInside, 160, 18, 0);
    expect(anchorInside.x).toBeGreaterThan(margin.left); // the anchor itself is on screen
    expect(rectInside(wide, viewport, margin)).toBe(false); // but half of the text is not
    expect(rectInside(labelRect({ x: 195, y: 300 }, 160, 18, 0), viewport, margin)).toBe(true);
    expect(rectInside(labelRect({ x: 195, y: 50 }, 160, 18, 0), viewport, margin)).toBe(false); // above the top margin
    expect(rectInside(labelRect({ x: 195, y: 830 }, 160, 18, 0), viewport, margin)).toBe(false); // under the bottom margin
  });
  it("falls back to the compact HUD when the text is hidden, behind the camera or off screen; none when off", () => {
    const ok = { enabled: true, hasTarget: true, inFront: true, sight: true, rect: labelRect({ x: 195, y: 300 }, 160, 18, 0), viewport, margin };
    expect(choosePromptPlace(ok)).toBe("world");
    expect(choosePromptPlace({ ...ok, sight: false })).toBe("hud");
    expect(choosePromptPlace({ ...ok, inFront: false })).toBe("hud");
    expect(choosePromptPlace({ ...ok, rect: labelRect({ x: 5, y: 300 }, 160, 18, 0) })).toBe("hud");
    expect(choosePromptPlace({ ...ok, rect: null })).toBe("hud");
    expect(choosePromptPlace({ ...ok, enabled: false })).toBe("none");
    expect(choosePromptPlace({ ...ok, hasTarget: false })).toBe("none");
  });
  it("projects NDC to CSS px and flags points behind the camera", () => {
    expect(ndcToScreen({ x: 0, y: 0, z: 0.5 }, viewport)).toEqual({ x: 195, y: 422, inFront: true });
    expect(ndcToScreen({ x: 0, y: 0, z: 1.2 }, viewport).inFront).toBe(false);
  });
});
describe("door text sits on the visible side", () => {
  it("the high-door prompt is moved from the panel toward the player, on either side", () => {
    const g = LEVEL.highDoors.frontExit;
    const inside = interactTarget(adult({ x: g.handle.x - 0.6, z: g.handle.z }), LEVEL)!;
    expect(inside.pos.x).toBeLessThan(g.handle.x);
    const outside = interactTarget(adult({ x: g.handle.x + 0.6, z: g.handle.z }), LEVEL);
    if (outside) expect(outside.pos.x).toBeGreaterThan(g.handle.x);
    const dry = interactTarget(adult(W.bathDoorDry, { wet: "wet" }), LEVEL)!;
    expect(distance(dry.pos, W.bathDoorDry)).toBeLessThan(distance(dry.pos, { x: dry.pos.x, z: dry.pos.z - 5 }));
  });
});
