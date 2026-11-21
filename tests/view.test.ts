// View, HUD and camera for the one growing player (2026-11-21).
import { describe, expect, it } from "vitest";
import { nearbyHints, objective } from "../src/core/guide";
import { DT } from "../src/core/tuning";
import type { GameState } from "../src/core/types";
import { KeyboardState } from "../src/input/keyboard";
import { LEVEL } from "../src/level/layout";
import { advance } from "../src/loop";
import { blendPose, FollowCamera, SWITCH_SECONDS } from "../src/view/camera";
import { BODY_HEIGHT, deriveView, statusLines } from "../src/view/deriveView";
import { KEY_HELP, toastFor } from "../src/view/hud";
import { CAMERA_PROFILE, FacingTracker, obstaclesFor, shoulderPose } from "../src/view/shoulder";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";

const W = LEVEL.waypoints;
const STALE = /Tab|切り替|渡す|500円|鍵|帽子|ハット|池の奥|ゴール|抱え/;

describe("view and guide along the full route", () => {
  it("one visible body at the player, objective/hints/status consistent at every step, no old-route wording", () => {
    const sim = new Sim();
    const seen: string[] = [];
    const check = () => {
      const s = sim.state;
      const v = deriveView(s, LEVEL);
      const shown = (["duck", "child", "adult"] as const).filter((id) => v.characters[id].visible);
      expect(shown).toEqual([s.player.stage]);
      for (const id of ["duck", "child", "adult"] as const) {
        expect([v.characters[id].pos.x, v.characters[id].pos.z]).toEqual([s.player.pos.x, s.player.pos.z]);
      }
      expect(v.active).toBe(s.player.stage);
      expect(v.focus.y).toBe(v.characters[s.player.stage].pos.y);
      for (const m of ["milk1", "milk2"] as const) expect(v.milk[m].visible).toBe(s.milk[m] === "available");
      const o = objective(s);
      expect(o).not.toMatch(STALE);
      for (const h of nearbyHints(s, LEVEL)) expect(h).not.toMatch(STALE);
      for (const l of statusLines(s)) expect(l).not.toMatch(STALE);
      if (seen[seen.length - 1] !== o) seen.push(o);
    };
    const origStep = sim.step.bind(sim);
    sim.step = (input) => {
      const ev = origStep(input);
      check();
      return ev;
    };
    check();
    expect(objective(sim.state)).toContain("牛乳びん");
    R.fullRoute(sim);
    expect(objective(sim.state)).toContain("クリア");
    expect(seen.length).toBeGreaterThanOrEqual(6);
  });

  it("the HUD shows the stage, the bottle count and the E action", () => {
    const sim = new Sim();
    expect(statusLines(sim.state)[0]).toContain("アヒル");
    expect(statusLines(sim.state)).toContain("牛乳びん：0 / 2 本");
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    expect(nearbyHints(sim.state, LEVEL)).toContain("E: 牛乳びんを飲む（子どもに育つ）");
    sim.press("interact");
    expect(statusLines(sim.state)[0]).toContain("子ども");
    expect(statusLines(sim.state)).toContain("牛乳びん：1 / 2 本");
    expect(toastFor({ kind: "grew", milk: "milk1", from: "duck", to: "child" })).toBe("牛乳を飲んで子どもに育った！");
    for (const line of KEY_HELP) expect(line).not.toMatch(/Tab|渡す|Esc/);
  });

  it("near a high handle, a Child is told it cannot reach; the Adult is offered to open it", () => {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.walk([W.passageSouth, W.passageNorth, { x: 0.9, z: 3.4 }]);
    expect(nearbyHints(sim.state, LEVEL)).toContain("E: 取っ手が高くて届かない");
    sim.walk([W.milk2Stand]);
    sim.press("interact");
    sim.walk([W.gateIn]);
    expect(nearbyHints(sim.state, LEVEL)).toContain("E: 高い掛け金を外して戸を開ける");
  });

  it("doors are drawn closed until opened; the guardian is drawn at its state position", () => {
    const sim = new Sim();
    let v = deriveView(sim.state, LEVEL);
    expect(v.doorsOpen).toEqual({ kidsGate: false, frontExit: false });
    expect([v.guardian.x, v.guardian.z]).toEqual([LEVEL.guardianPath[0]!.x, LEVEL.guardianPath[0]!.z]);
    expect(v.guardian.y).toBe(BODY_HEIGHT.adult / 2);
    R.duckDrinksMilk1(sim);
    R.childDrinksMilk2(sim);
    R.adultDriesAndDresses(sim);
    v = deriveView(sim.state, LEVEL);
    expect(v.doorsOpen).toEqual({ kidsGate: true, frontExit: false });
    expect(v.characters.adult.clothing).toBe("clothed");
  });
});

describe("camera", () => {
  const obs = obstaclesFor(LEVEL, { kidsGate: "closed", frontExit: "closed" });
  const pose = (id: "duck" | "child" | "adult", x: number, y: number, z: number) => shoulderPose(id, { x, y, z }, 0, obs);

  it("Duck has the lowest eye line", () => {
    expect(CAMERA_PROFILE.duck.eye).toBeLessThan(CAMERA_PROFILE.child.eye);
    expect(CAMERA_PROFILE.child.eye).toBeLessThan(CAMERA_PROFILE.adult.eye);
    expect(pose("duck", 6, 0.15, 6.8).eye.y).toBeLessThan(1);
  });

  it("growth blends height and distance over 0.4 s at the same place and facing", () => {
    expect(SWITCH_SECONDS).toBe(0.4);
    const sim = new Sim();
    sim.walk([W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]);
    const facing = new FacingTracker();
    const cam = new FollowCamera();
    let v = deriveView(sim.state, LEVEL);
    facing.update(v);
    facing.lookAlong(0.3);
    const duckPose = cam.update(v.active, v.focus, 0.016, facing.yaw(v.active), obs);
    sim.press("interact");
    v = deriveView(sim.state, LEVEL);
    facing.update(v);
    expect(facing.yaw(v.active)).toBe(0.3); // growth keeps the facing
    const first = cam.update(v.active, v.focus, 0.1, facing.yaw(v.active), obs);
    const goal = shoulderPose("child", v.focus, 0.3, obs);
    expect(first.eye.y).toBeGreaterThan(duckPose.eye.y);
    expect(first.eye.y).toBeLessThan(goal.eye.y);
    let p = first;
    for (let t = 0; t < 0.4; t += 0.1) p = cam.update(v.active, v.focus, 0.1, facing.yaw(v.active), obs);
    expect(p).toEqual(goal);
    const a = pose("duck", 4, 0.15, 5);
    const b = pose("adult", 10, 0.85, 4);
    expect(blendPose(a, b, 0)).toEqual(a);
    expect(blendPose(a, b, 0.4)).toEqual(b);
  });
});

describe("keyboard-driven route start", () => {
  /** Press 8-direction keys toward a target, like a player would. */
  function keyWalk(kb: KeyboardState, s: GameState, target: { x: number; z: number }, tol = 0.08): GameState {
    for (let i = 0; i < 3000; i++) {
      const p = s.player.pos;
      const dx = target.x - p.x;
      const dz = target.z - p.z;
      if (Math.hypot(dx, dz) <= tol) break;
      for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) kb.keyUp(k);
      if (dx > 0.02) kb.keyDown("KeyD");
      if (dx < -0.02) kb.keyDown("KeyA");
      if (dz > 0.02) kb.keyDown("KeyS");
      if (dz < -0.02) kb.keyDown("KeyW");
      s = advance(s, 0, DT, () => kb.takeFrame(), LEVEL).state;
    }
    for (const k of ["KeyW", "KeyA", "KeyS", "KeyD"]) kb.keyUp(k);
    return s;
  }
  const press = (kb: KeyboardState, s: GameState, code: string) => {
    kb.keyDown(code);
    const r = advance(s, 0, DT, () => kb.takeFrame(), LEVEL).state;
    kb.keyUp(code);
    return r;
  };

  it("Duck swims to the pool and grows; the Child walks the passage and grows into the Adult, keys only", () => {
    const kb = new KeyboardState();
    let s = new Sim().state;
    for (const p of [W.tubWestDeep, W.troughGap, W.poolIn, W.milk1Swim]) s = keyWalk(kb, s, p);
    s = press(kb, s, "KeyE");
    expect(s.player.stage).toBe("child");
    for (const p of [W.passageSouth, W.passageNorth, W.milk2Stand]) s = keyWalk(kb, s, p);
    s = press(kb, s, "KeyE");
    expect(s.player.stage).toBe("adult");
    expect(s.outcome).toEqual({ kind: "playing" });
  });
});
