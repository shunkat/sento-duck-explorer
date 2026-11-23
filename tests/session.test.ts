// Connection regressions for the input boundaries that main.ts wires together.
// They use the real MouseLook, KeyboardState, TouchInput, advance and core with fake DOM calls.
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../src/core/initialState";
import { tick } from "../src/core/tick";
import { DT } from "../src/core/tuning";
import { EMPTY_INPUT, type GameState } from "../src/core/types";
import { DEFAULT_CONTROLS } from "../src/input/controlSettings";
import { KeyboardState } from "../src/input/keyboard";
import { MouseLook } from "../src/input/look";
import { gateRestartFrame, InputSession } from "../src/input/session";
import { STICK_RADIUS, TouchInput } from "../src/input/touch";
import { LEVEL } from "../src/level/layout";
import { advance } from "../src/loop";
import { cameraRelativeMove } from "../src/view/shoulder";
import * as R from "./helpers/route";
import { Sim } from "./helpers/sim";
function rig(lockApi: () => Promise<void> | void = () => undefined, dragOnly = false) {
  const kb = new KeyboardState();
  const touch = new TouchInput();
  const sink = { orbit: vi.fn(), tilt: vi.fn() };
  let locked = false;
  const target = { requestPointerLock: vi.fn(lockApi) };
  const mouse = new MouseLook(sink, () => ({ ...DEFAULT_CONTROLS, dragOnly }), target, () => locked);
  const deps = {
    isLocked: () => locked,
    exitLock: vi.fn(() => { locked = false; }),
    releaseCapture: vi.fn(),
    openSettings: vi.fn(),
  };
  const session = new InputSession(deps, kb, touch, mouse);
  /** What the browser does: the grant, then pointerlockchange. */
  const grant = () => { locked = true; session.onLockChange(); };
  /** The browser drops the lock (Escape) and fires pointerlockchange. */
  const drop = () => { locked = false; session.onLockChange(); };
  const click = () => { mouse.pointerDown(1, 0, 0, 0, 0); return mouse.pointerUp(1, 50); };
  return { kb, touch, sink, target, mouse, deps, session, grant, drop, click, isLocked: () => locked };
}
describe("R1: a restart is an input boundary inside the same update", () => {
  function gameOverAtPool(): GameState {
    const sim = new Sim();
    R.duckDrinksMilk1(sim);
    sim.press("toggleTowel");
    sim.walk([LEVEL.waypoints.passageSouth, { x: 0.6, z: 7.6 }]);
    sim.press("dipTowel");
    expect(sim.state.outcome).toEqual({ kind: "gameOver", reason: "F1" });
    return sim.state;
  }
  it("a held W with R in a 100 ms update restores the checkpoint and none of the leftover ticks move the player", () => {
    const over = gameOverAtPool();
    const kb = new KeyboardState();
    const touch = new TouchInput();
    kb.keyDown("KeyW");
    kb.keyDown("KeyR");
    const frame = (s: GameState) => {
      const f = kb.takeFrame();
      const g = gateRestartFrame(s, f);
      return g !== f ? g : { ...f, move: cameraRelativeMove(f.move, 0), run: f.run || touch.sample().run };
    };
    const r = advance(over, 0, 0.1, frame, LEVEL);
    expect(r.ticks).toBe(1);
    expect(r.accumulator).toBe(0);
    expect(r.state.outcome.kind).toBe("playing");
    expect(r.state.player.pos).toEqual(LEVEL.growthSpots.milk2);
    expect(r.state.tickCount).toBe(over.tickCount + 1);
  });
  it("without the fix path a stale stick would have moved on; with it, the same update leaves the spot exactly and later fresh input works", () => {
    const over = gameOverAtPool();
    const touch = new TouchInput();
    touch.stickDown(1, 60, 500, 60, 500);
    touch.stickMove(1, 60 + STICK_RADIUS, 500);
    const kb = new KeyboardState();
    kb.press("restart");
    const frame = (s: GameState) => {
      const f = kb.takeFrame();
      const g = gateRestartFrame(s, f);
      if (g !== f) return g;
      const t = touch.sample();
      return { ...f, move: cameraRelativeMove(t.move, 0) };
    };
    const r = advance(over, 0, 0.1, frame, LEVEL);
    expect(r.state.player.pos).toEqual(LEVEL.growthSpots.milk2);
    touch.clear(); // main's clear after the restored event
    const next = advance(r.state, 0, DT * 3, () => ({ ...EMPTY_INPUT, move: { x: 0, z: -1 } }), LEVEL);
    expect(next.state.player.pos).not.toEqual(LEVEL.growthSpots.milk2);
  });
  it("gateRestartFrame only strips input on a game-over restart", () => {
    const f = { ...EMPTY_INPUT, move: { x: 1, z: 0 }, run: true, restart: true };
    const playing = createInitialState(LEVEL);
    expect(gateRestartFrame(playing, f)).toBe(f);
    const over = { ...playing, outcome: { kind: "gameOver", reason: "F2" } } as GameState;
    expect(gateRestartFrame(over, f)).toEqual({ ...EMPTY_INPUT, restart: true });
    expect(tick(over, gateRestartFrame(over, f), LEVEL).events.some((e) => e.kind === "restored")).toBe(true);
  });
});
describe("R2: ending, rotating and restarting release the mouse side too", () => {
  it("a game over gives back a held Pointer Lock, forbids a new one, and does not reopen settings", () => {
    const r = rig();
    expect(r.click()).toBe(true);
    r.grant();
    expect(r.isLocked()).toBe(true);
    r.session.setState({ playing: false });
    expect(r.deps.exitLock).toHaveBeenCalledTimes(1);
    r.drop(); // the change caused by our own release
    expect(r.deps.openSettings).not.toHaveBeenCalled();
    expect(r.click()).toBe(false); // no new capture on the result screen
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
    r.session.setState({ playing: true }); // normal play resumed
    expect(r.click()).toBe(true); // a fresh user action may capture again
  });
  it("a rotation (clearInputs) ends a right drag and releases its DOM capture; the old drag does not keep turning the view", () => {
    const r = rig();
    r.mouse.pointerDown(7, 2, 0, 0, 0);
    r.session.trackCapture(7);
    r.mouse.pointerMove(7, 10, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
    r.session.clearInputs();
    expect(r.deps.releaseCapture).toHaveBeenCalledWith(7);
    r.mouse.pointerMove(7, 40, 0);
    expect(r.sink.orbit).toHaveBeenCalledTimes(1);
  });
  it("clearInputs drops keys, touch owners, pending presses and the lock", () => {
    const r = rig();
    r.kb.keyDown("KeyW");
    r.kb.press("interact");
    r.touch.stickDown(1, 0, 0, 40, 0);
    r.touch.lookDown(2, 500, 100);
    r.click();
    r.grant();
    r.session.clearInputs();
    expect(r.kb.takeFrame()).toMatchObject({ move: { x: 0, z: 0 }, interact: false });
    expect([r.touch.stickOwner, r.touch.lookOwner]).toEqual([null, null]);
    expect(r.deps.exitLock).toHaveBeenCalled();
    r.drop();
    expect(r.deps.openSettings).not.toHaveBeenCalled();
  });
});
describe("R4: an old Pointer Lock request is void after any boundary", () => {
  for (const [name, api] of [["void API", () => undefined], ["Promise API", () => new Promise<void>(() => undefined)]] as const) {
    it(`${name}: a grant arriving after a modal opened and closed is given back`, () => {
      const r = rig(api);
      expect(r.click()).toBe(true); // pending
      r.session.setState({ modal: true });
      r.session.clearInputs();
      r.session.setState({ modal: false }); // closed again, the old grant still not delivered
      r.grant();
      expect(r.deps.exitLock).toHaveBeenCalled(); // not accepted
      expect(r.isLocked()).toBe(false);
      r.drop();
      expect(r.deps.openSettings).not.toHaveBeenCalled();
      expect(r.click()).toBe(true); // a new explicit click may request again
      r.grant();
      expect(r.isLocked()).toBe(true);
    });
  }
  it("a grant that arrives while a modal is open is given back too", () => {
    const r = rig();
    r.click();
    r.session.setState({ modal: true });
    r.grant();
    expect(r.isLocked()).toBe(false);
  });
  it("a pending request is not stacked, and an error ends it so a new click works", () => {
    const r = rig();
    expect(r.click()).toBe(true);
    expect(r.click()).toBe(false);
    r.session.onLockError();
    expect(r.click()).toBe(true);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(2);
  });
  it("a rejected Promise ends the request", async () => {
    const r = rig(() => Promise.reject(new Error("denied")));
    expect(r.click()).toBe(true);
    await Promise.resolve();
    await Promise.resolve();
    expect(r.click()).toBe(true);
  });
});
describe("R8: Escape pauses ordinary play without a capture", () => {
  const esc = { code: "Escape", repeat: false, defaultPrevented: false };
  it("opens settings with nothing captured, in drag-only mode and after a refused lock", () => {
    for (const dragOnly of [false, true]) {
      const r = rig(() => { throw new Error("refused"); }, dragOnly);
      r.click();
      expect(r.session.onEscape(esc)).toBe(true);
      expect(r.deps.openSettings).toHaveBeenCalledTimes(1);
    }
  });
  it("is ignored while a modal, the pause screen or a result is up, for repeats and other keys", () => {
    const r = rig();
    for (const patch of [{ modal: true }, { blocked: true }, { playing: false }]) {
      r.session.setState({ modal: false, blocked: false, playing: true, ...patch });
      expect(r.session.onEscape(esc)).toBe(false);
    }
    r.session.setState({ modal: false, blocked: false, playing: true });
    expect(r.session.onEscape({ ...esc, repeat: true })).toBe(false);
    expect(r.session.onEscape({ ...esc, code: "KeyE" })).toBe(false);
    expect(r.session.onEscape({ ...esc, defaultPrevented: true })).toBe(false);
    expect(r.deps.openSettings).not.toHaveBeenCalled();
  });
  it("a captured Escape opens settings from the lock release; a second keydown path only asks again (idempotent in the HUD)", () => {
    const r = rig();
    r.click();
    r.grant();
    r.drop();
    expect(r.deps.openSettings).toHaveBeenCalledTimes(1);
  });
});
describe("R4 follow-up: open requests are never stacked and completions are matched by token", () => {
  /** A Promise API whose requests are settled by the test, in any order. */
  function promiseRig() {
    const settles: { resolve: () => void; reject: () => void }[] = [];
    const r = rig(() => new Promise<void>((resolve, reject) => { settles.push({ resolve, reject: () => reject(new Error("denied")) }); }));
    return { ...r, settles };
  }
  const flush = async () => { for (let i = 0; i < 4; i++) await Promise.resolve(); };
  const boundary = (r: ReturnType<typeof rig>) => {
    r.session.setState({ modal: true });
    r.session.clearInputs();
    r.session.setState({ modal: false });
  };
  it("void: A open -> settings open/close -> click B is not issued -> A's late grant is given back -> click C locks", () => {
    const r = rig(() => undefined);
    expect(r.click()).toBe(true); // A
    boundary(r);
    expect(r.click()).toBe(false); // B: A still open
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
    r.grant(); // A's grant, stale epoch
    expect(r.isLocked()).toBe(false);
    r.drop();
    expect(r.deps.openSettings).not.toHaveBeenCalled();
    expect(r.click()).toBe(true); // C
    r.grant();
    expect(r.isLocked()).toBe(true);
  });
  it("Promise: the same order; A's grant is given back and C locks after it", async () => {
    const r = promiseRig();
    expect(r.click()).toBe(true);
    boundary(r);
    expect(r.click()).toBe(false);
    r.grant();
    r.settles[0]!.resolve();
    await flush();
    expect(r.isLocked()).toBe(false);
    r.drop();
    expect(r.click()).toBe(true);
    r.grant();
    expect(r.isLocked()).toBe(true);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(2);
  });
  it("an open request is not overwritten after more than 10 s; its grant is still the old one", () => {
    vi.useFakeTimers();
    try {
      const r = rig(() => undefined);
      expect(r.click()).toBe(true);
      boundary(r);
      vi.advanceTimersByTime(60_000);
      expect(r.click()).toBe(false);
      expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
      r.grant();
      expect(r.isLocked()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("same epoch: a second click while the first request is open is not issued", () => {
    const r = rig(() => undefined);
    expect(r.click()).toBe(true);
    expect(r.click()).toBe(false);
    expect(r.mouse.requestOpen).toBe(true);
    r.session.onLockError(); // void: the error completes it
    expect(r.mouse.requestOpen).toBe(false);
    expect(r.click()).toBe(true);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(2);
  });
  it("Promise: reject A -> new request B -> A's late pointerlockerror does not end B; B's grant is kept", async () => {
    const r = promiseRig();
    expect(r.click()).toBe(true); // A
    r.settles[0]!.reject();
    await flush();
    expect(r.click()).toBe(true); // B, same epoch
    r.session.onLockError(); // A's echo
    expect(r.mouse.requestOpen).toBe(true);
    expect(r.click()).toBe(false); // B still open: no stacking
    r.grant(); // B's grant
    expect(r.isLocked()).toBe(true);
    expect(r.deps.exitLock).not.toHaveBeenCalled();
  });
  it("Promise: error first -> click suppressed while A's Promise is unsettled -> reject -> next click succeeds", async () => {
    const r = promiseRig();
    expect(r.click()).toBe(true);
    r.session.onLockError();
    expect(r.click()).toBe(false);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(1);
    r.settles[0]!.reject();
    await flush();
    expect(r.click()).toBe(true);
    expect(r.target.requestPointerLock).toHaveBeenCalledTimes(2);
  });
  it("Promise: an old rejection in the same epoch does not end the next request (token, not epoch)", async () => {
    const r = promiseRig();
    expect(r.click()).toBe(true); // A
    r.grant(); // A granted
    r.drop(); // Escape: unlock (opens settings once)
    r.session.setState({ modal: false }); // settings closed again without a boundary
    expect(r.click()).toBe(true); // B in a new or same epoch
    r.settles[0]!.reject(); // a late rejection for A (never happens with a resolved A, but must not touch B)
    await flush();
    expect(r.mouse.requestOpen).toBe(true);
    r.grant();
    expect(r.isLocked()).toBe(true);
  });
  it("a synchronous throw ends only that request", () => {
    let throwNext = true;
    const r = rig(() => { if (throwNext) throw new Error("SecurityError"); });
    expect(r.click()).toBe(false);
    expect(r.mouse.requestOpen).toBe(false);
    throwNext = false;
    expect(r.click()).toBe(true);
    expect(r.mouse.requestOpen).toBe(true);
  });
  it("an error delivered synchronously inside the call ends a void request, but not a Promise request", async () => {
    let session!: InputSession;
    const v = rig(() => { session.onLockError(); });
    session = v.session;
    expect(v.click()).toBe(true);
    expect(v.mouse.requestOpen).toBe(false);
    let reject!: () => void;
    const p = rig(() => { session.onLockError(); return new Promise<void>((_, rj) => { reject = () => rj(new Error("x")); }); });
    session = p.session;
    expect(p.click()).toBe(true);
    expect(p.mouse.requestOpen).toBe(true);
    reject();
    await flush();
    expect(p.mouse.requestOpen).toBe(false);
  });
});
