import { describe, expect, it } from "vitest";
import { nearbyHints, objective } from "../src/core/guide";
import { DT } from "../src/core/tuning";
import type { GameState } from "../src/core/types";
import { KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance } from "../src/loop";
import { blendPose, CAMERA_OFFSET, FollowCamera, followPose, SWITCH_SECONDS } from "../src/view/camera";
import { deriveView, statusLines } from "../src/view/deriveView";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const hatOnDuck = (s: GameState) => s.items.hat.owner.kind === "character" && s.items.hat.owner.id === "duck" && s.items.hat.status === "equipped";

describe("view and guide along the full route", () => {
  it("objective, hints, status, and hat display stay consistent at every step", () => {
    const sim = new Sim();
    const seen: string[] = [];
    const check = () => {
      const s = sim.state;
      const v = deriveView(s, LEVEL);
      expect(v.hatAttachedToDuck).toBe(hatOnDuck(s)); // Property 15 along a real playthrough
      expect(v.active).toBe(s.active);
      expect(v.characters[s.active].active).toBe(true);
      const o = objective(s);
      expect(o.length).toBeGreaterThan(0);
      if (seen[seen.length - 1] !== o) seen.push(o);
      expect(statusLines(s)).toHaveLength(8);
      nearbyHints(s, LEVEL);
    };
    const origStep = sim.step.bind(sim);
    sim.step = (input) => {
      const ev = origStep(input);
      check();
      return ev;
    };

    check();
    expect(objective(sim.state)).toContain("500円玉");
    expect(objective(sim.state)).toContain("アヒル");
    R.duckGetsCoin(sim);
    R.duckGivesCoin(sim);
    R.adultPaysWithChild(sim);
    R.adultGivesKey(sim);
    R.childUnlocksSauna(sim);
    R.childEntersSauna(sim);
    R.childGetsHat(sim);
    R.childLeavesSauna(sim);
    R.childEquipsHat(sim);
    R.adultCarriesDuckToPond(sim);
    R.duckSwimsToGoal(sim);
    expect(objective(sim.state)).toContain("クリア");
    // The guide changed through the stages of the route.
    expect(seen.length).toBeGreaterThanOrEqual(10);
  });

  it("shows the action available nearby", () => {
    const sim = new Sim();
    expect(nearbyHints(sim.state, LEVEL)).toEqual([]);
    sim.walk([{ x: 1, z: 5.5 }, { x: LEVEL.nodes.narrow_hole_coin.x + 0.2, z: LEVEL.nodes.narrow_hole_coin.z }]);
    expect(nearbyHints(sim.state, LEVEL)).toContain("E: 500円玉を拾う");
    sim.switchTo("child");
    expect(objective(sim.state)).toContain("Tabでアヒル");
  });

  it("held items are drawn at their holder; the carried Duck is in Adult's arms", () => {
    const sim = new Sim();
    R.playUntilHatEquipped(sim);
    let v = deriveView(sim.state, LEVEL);
    expect(v.items.hat.pos.x).toBe(v.characters.duck.pos.x);
    expect(v.items.hat.pos.y).toBeGreaterThan(v.characters.duck.pos.y);
    expect(v.items.key.pos.x).toBeCloseTo(v.characters.child.pos.x + 0.15, 9);
    sim.switchTo("adult");
    sim.approach(sim.pos("duck"), 1.0);
    sim.press("interact");
    v = deriveView(sim.state, LEVEL);
    expect(v.characters.duck.carried).toBe(true);
    expect(v.characters.duck.pos.x).toBe(v.characters.adult.pos.x);
    expect(v.hatAttachedToDuck).toBe(true);
  });
});

describe("camera", () => {
  it("Duck has the lowest eye line", () => {
    expect(CAMERA_OFFSET.duck.y).toBeLessThan(CAMERA_OFFSET.child.y);
    expect(CAMERA_OFFSET.child.y).toBeLessThan(CAMERA_OFFSET.adult.y);
    expect(followPose("duck", { x: 0, y: 0.15, z: 0 }).eye.y).toBeLessThan(1);
  });

  it("blends over 0.4 s after a switch", () => {
    expect(SWITCH_SECONDS).toBe(0.4);
    const a = followPose("duck", { x: 0, y: 0, z: 0 });
    const b = followPose("adult", { x: 10, y: 0.85, z: 0 });
    expect(blendPose(a, b, 0)).toEqual(a);
    expect(blendPose(a, b, 0.4)).toEqual(b);
    const mid = blendPose(a, b, 0.2);
    expect(mid.eye.x).toBeGreaterThan(a.eye.x);
    expect(mid.eye.x).toBeLessThan(b.eye.x);

    const cam = new FollowCamera();
    cam.update("duck", { x: 0, y: 0, z: 0 }, 0.016);
    const p1 = cam.update("adult", { x: 10, y: 0.85, z: 0 }, 0.1);
    expect(p1.eye.x).toBeLessThan(b.eye.x);
    let p = p1;
    for (let t = 0; t < 0.4; t += 0.1) p = cam.update("adult", { x: 10, y: 0.85, z: 0 }, 0.1);
    expect(p).toEqual(b);
  });
});

describe("keyboard-driven start of the route", () => {
  /** Press 8-direction keys toward a target, like a player would. */
  function keyWalk(kb: KeyboardState, s: GameState, target: { x: number; z: number }, tol = 0.08): GameState {
    for (let i = 0; i < 2000; i++) {
      const p = s[s.active].pos;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      if (Math.hypot(dx, dz) <= tol) break;
      for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) kb.keyUp(k);
      if (dx > 0.02) kb.keyDown("KeyD");
      if (dx < -0.02) kb.keyDown("KeyA");
      if (dz > 0.02) kb.keyDown("KeyS");
      if (dz < -0.02) kb.keyDown("KeyW");
      s = advance(s, 0, DT, (st) => kb.takeFrame(st.dialog !== null), LEVEL).state;
    }
    for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) kb.keyUp(k);
    return s;
  }
  const press = (kb: KeyboardState, s: GameState, code: string) => {
    kb.keyDown(code);
    const r = advance(s, 0, DT, (st) => kb.takeFrame(st.dialog !== null), LEVEL).state;
    kb.keyUp(code);
    return r;
  };

  it("Duck finds the coin and hands it to Adult with keys only", () => {
    const kb = new KeyboardState();
    const sim = new Sim();
    let s = sim.state;
    s = keyWalk(kb, s, { x: 1, z: 5.5 });
    s = keyWalk(kb, s, { x: LEVEL.nodes.narrow_hole_coin.x + 0.2, z: LEVEL.nodes.narrow_hole_coin.z });
    s = press(kb, s, "KeyE");
    expect(s.items.coin.owner).toEqual({ kind: "character", id: "duck" });
    s = keyWalk(kb, s, { x: 1, z: 5.5 });
    s = keyWalk(kb, s, { x: s.adult.pos.x - 0.6, z: s.adult.pos.z });
    s = press(kb, s, "KeyE");
    expect(s.dialog).toEqual({ item: "coin", from: "duck", to: "adult" });
    s = press(kb, s, "KeyE"); // E confirms while the dialog is open
    expect(s.items.coin.owner).toEqual({ kind: "character", id: "adult" });
    s = press(kb, s, "Tab");
    expect(s.active).toBe("child");
  });
});
