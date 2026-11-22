// Browser entry: fixed 60 Hz logic, render at display rate.
import { interactTarget } from "./core/actions";
import { createInitialState } from "./core/initialState";
import { checkInvariants } from "./core/invariants";
import type { CharacterId, CheckpointId, GameState } from "./core/types";
import { ControlSettings } from "./input/controlSettings";
import { attachKeyboard, KeyboardState } from "./input/keyboard";
import { gateRestartFrame, InputSession } from "./input/session";
import { MouseLook } from "./input/look";
import { regionAt, TouchInput } from "./input/touch";
import { LEVEL } from "./level/layout";
import { Lifecycle } from "./lifecycle";
import { advance } from "./loop";
import { FollowCamera } from "./view/camera";
import { deriveView } from "./view/deriveView";
import { HelpSettings } from "./view/helpSettings";
import { Hud } from "./view/hud";
import { MiniMap } from "./view/minimap";
import { CHARACTER_MODEL_URLS, ITEM_MODEL_URLS, ENVIRONMENT_MODEL_URLS } from "./view/modelEntry";
import { pixelRatioCap } from "./view/renderQuality";
import { GameScene } from "./view/scene";
import { CHECKPOINT_VIEW_YAW, cameraRelativeMove, FacingTracker, ORBIT_KEY_RATE, obstaclesFor } from "./view/shoulder";
import { TouchUi } from "./view/touchUi";
const app = document.getElementById("app")!;
const hudRoot = document.getElementById("hud")!;
const scene = new GameScene(app, LEVEL);
const canvas = scene.renderer.domElement;
const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
let touchMode = coarse;
const controls = new ControlSettings();
const help = new HelpSettings();
const camera = new FollowCamera();
const facing = new FacingTracker();
const kb = new KeyboardState();
const touch = new TouchInput();
const life = new Lifecycle();
let state: GameState = createInitialState(LEVEL);
let accumulator = 0;
let last = performance.now();
// Look: mouse (optional Pointer Lock, drag fallback) and touch (independent finger).
const lookSink = {
  orbit: (d: number) => camera.orbit(d),
  tilt: (d: number) => camera.tilt(d),
};
const mouse = new MouseLook(lookSink, () => controls.values, canvas, () => document.pointerLockElement === canvas);
const paused = () => hud.isSettingsOpen || minimap.expanded || touchUi.menuOpen;
const session = new InputSession({
  isLocked: () => document.pointerLockElement === canvas,
  exitLock: () => { try { document.exitPointerLock(); } catch { /* Already unlocked. */ } },
  releaseCapture: (id) => { try { canvas.releasePointerCapture(id); } catch { /* Already released. */ } },
  openSettings: () => hud.openSettings(),
}, kb, touch, mouse);
const sessionState = () => ({ modal: paused(), blocked: life.blocked, playing: state.outcome.kind === "playing" });
/** Capture is only wanted while playing: never during a modal, a pause, a blur or after the game ended. */
function updateCapture(): void {
  session.setState(sessionState());
  syncUi();
}
/** Drop every held input and stale timing (modal, blur, hide, rotation, outcome, restart). */
function clearInputs(): void {
  session.clearInputs();
  touchUi.syncFromInput();
  accumulator = 0;
  last = performance.now();
}
/** Controls and the map are inert behind a pause, a result or the context-loss screen. */
let uiPlayable = true;
function syncUi(): void {
  const playable = !life.blocked && state.outcome.kind === "playing";
  if (playable === uiPlayable) return;
  uiPlayable = playable;
  touchUi.setEnabled(playable);
  hud.setBackgroundInert(!playable);
  const map = document.getElementById("map")!;
  if (playable) { map.removeAttribute("inert"); map.removeAttribute("aria-hidden"); }
  else { map.setAttribute("inert", ""); map.setAttribute("aria-hidden", "true"); }
}
function onPauseChange(): void {
  clearInputs();
  updateCapture();
  // A modal removes the target outline and prompt at once (the frame loop is paused).
  if (paused()) {
    hud.setPrompt(null);
    scene.hideFeedback();
  }
}
const hud = new Hud(hudRoot, onPauseChange, help, {
  controls,
  isTouch: () => touchMode,
  onHelpChange: (enabled) => { if (!enabled) scene.hideFeedback(); },
  onControlsChange: applyQuality,
  onRestart: () => kb.press("restart"),
  onContinue: () => {
    if (life.resume()) {
      hud.setPause(null);
      clearInputs();
      updateCapture();
    }
  },
});
const minimap = new MiniMap(document.getElementById("map")!, LEVEL, onPauseChange);
const touchUi = new TouchUi(document.getElementById("touch")!, {
  touch,
  press: (a) => kb.press(a),
  onModalChange: onPauseChange,
});
function enableTouch(): void {
  if (touchMode) return;
  touchMode = true;
  document.body.classList.add("touch");
  touchUi.setVisible(true);
  applyQuality();
}
document.body.classList.toggle("touch", touchMode);
touchUi.setVisible(touchMode);
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
document.addEventListener("gesturestart", (e) => e.preventDefault());
window.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") enableTouch(); }, { capture: true });
const sens = () => controls.values.sensitivity * (controls.values.invertY ? -1 : 1);
canvas.addEventListener("pointerdown", (e) => {
  if (!session.active) return;
  if (e.pointerType === "touch") {
    // Only the right-hand area looks; the left area belongs to the stick pad.
    if (regionAt(e.clientX, canvas.clientWidth) !== "look") return;
    if (touch.lookDown(e.pointerId, e.clientX, e.clientY)) {
      canvas.setPointerCapture(e.pointerId);
      session.trackCapture(e.pointerId);
    }
    return;
  }
  mouse.pointerDown(e.pointerId, e.button, e.clientX, e.clientY, e.timeStamp);
  canvas.setPointerCapture(e.pointerId);
  session.trackCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!session.active) return;
  if (e.pointerType === "touch") {
    const d = touch.lookMove(e.pointerId, e.clientX, e.clientY);
    if (d) {
      camera.orbit(d.yaw * controls.values.sensitivity);
      camera.tilt(d.pitch * sens());
    }
    return;
  }
  if (document.pointerLockElement === canvas) mouse.lockedMove(e.movementX, e.movementY);
  else mouse.pointerMove(e.pointerId, e.clientX, e.clientY);
});
canvas.addEventListener("pointerup", (e) => {
  session.untrackCapture(e.pointerId);
  if (e.pointerType === "touch") touch.release(e.pointerId);
  else mouse.pointerUp(e.pointerId, e.timeStamp);
});
// Cancel and lost capture release only what this pointer owns.
const endPointer = (e: PointerEvent) => {
  session.untrackCapture(e.pointerId);
  touch.release(e.pointerId);
  mouse.pointerEnd(e.pointerId);
};
canvas.addEventListener("pointercancel", endPointer);
canvas.addEventListener("lostpointercapture", endPointer);
document.addEventListener("pointerlockchange", () => session.onLockChange());
// Pointer lock may fail (not allowed, no gesture): play on, never retry by itself.
document.addEventListener("pointerlockerror", () => session.onLockError());
// Escape in ordinary play (nothing captured) pauses into settings too.
window.addEventListener("keydown", (e) => { if (session.onEscape(e)) e.preventDefault(); });
// Page leave: stop, clear every input including run, and wait for 「続ける」.
function goAway(): void {
  life.away();
  clearInputs();
  updateCapture();
  hud.setPause(life.reason);
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") goAway();
  else clearInputs();
});
window.addEventListener("blur", goAway);
window.addEventListener("pagehide", goAway);
canvas.addEventListener("webglcontextlost", (e) => {
  e.preventDefault();
  life.contextLost();
  clearInputs();
  updateCapture();
  hud.setPause(life.reason);
});
canvas.addEventListener("webglcontextrestored", () => {
  life.contextRestored();
  clearInputs();
  hud.setPause(life.reason);
});
// Final models, when any are listed. A failure keeps the primitive.
const charEntries = Object.entries(CHARACTER_MODEL_URLS) as [CharacterId, string][];
const itemEntries = Object.entries(ITEM_MODEL_URLS) as [string, string][];
const modelEntries = [...charEntries, ...itemEntries, ...Object.entries(ENVIRONMENT_MODEL_URLS)];
if (modelEntries.length > 0) {
  let done = 0;
  let failed = 0;
  hud.setLoadStatus(`3Dモデルを読み込み中… 0/${modelEntries.length}`);
  void import("./view/models").then(({ ModelLibrary }) => {
    const models = new ModelLibrary();
    for (const [id, url] of modelEntries) {
      void models.load(id, import.meta.env.BASE_URL + url).then(() => {
        done++;
        if (!models.get(id)) failed++;
        scene.useModels(models);
        if (done < modelEntries.length) hud.setLoadStatus(`3Dモデルを読み込み中… ${done}/${modelEntries.length}`);
        else hud.setLoadStatus(failed > 0 ? `${failed}件の3Dモデルを読み込めず、簡易な形で表示しています。遊び続けられます。` : null);
      });
    }
  }).catch((error) => {
    console.warn("Model loader unavailable; keeping the placeholders.", error);
    hud.setLoadStatus("3Dモデルを読み込めませんでした。簡易な形で遊べます。");
  });
}
attachKeyboard(kb, window, () => !paused() && !life.blocked, () => !hud.isSettingsOpen && !touchUi.menuOpen && !life.blocked);
function applyQuality(): void {
  scene.setPixelRatioCap(pixelRatioCap({ coarsePointer: touchMode, lightweight: controls.values.lightweight }));
  resize();
}
let landscape = true;
function resize(): void {
  const w = app.clientWidth || window.innerWidth;
  const h = app.clientHeight || window.innerHeight;
  const nowLandscape = w > h;
  // Rotation keeps the game state but releases every held input. Address-bar
  // resizes (same orientation) must not interrupt a walk.
  if (nowLandscape !== landscape) {
    landscape = nowLandscape;
    clearInputs();
  }
  scene.resize(w, h);
}
window.addEventListener("resize", resize);
window.visualViewport?.addEventListener("resize", resize);
applyQuality();
landscape = app.clientWidth > app.clientHeight;
/** WASD, arrows and the stick map against the manually controlled view yaw. */
const takeFrame = (s: GameState) => {
  const f = kb.takeFrame();
  // The restart press is the whole frame: no held move, run or action goes with it (R and the button alike).
  const gated = gateRestartFrame(s, f);
  if (gated !== f) return gated;
  const t = touch.sample();
  const keyMove = f.move.x !== 0 || f.move.z !== 0;
  const move = keyMove ? f.move : t.move;
  return { ...f, move: cameraRelativeMove(move, camera.moveYaw), run: f.run || (!keyMove && t.run) };
};
/** Checkpoint load or new game: no stale camera yaw or facing (review N-1). */
function viewAlong(id: CheckpointId): void {
  camera.lookAlong(CHECKPOINT_VIEW_YAW[id]);
  facing.lookAlong(CHECKPOINT_VIEW_YAW[id]);
}
viewAlong("start");
let lastOutcome = state.outcome.kind;
const MARGIN = { desktop: { top: 48, right: 12, bottom: 64, left: 12 }, touch: { top: 100, right: 12, bottom: 120, left: 12 } };
function frame(nowMs: number): void {
  syncUi();
  const frameSeconds = (nowMs - last) / 1000;
  last = nowMs;
  const now = nowMs / 1000;
  const dt = Math.min(frameSeconds, 0.1);
  // After context loss nothing is drawn or advanced until restored and continued.
  if (!life.canDraw) {
    accumulator = 0;
    return;
  }
  if (life.blocked) {
    accumulator = 0;
    return;
  }
  if (hud.isSettingsOpen || touchUi.menuOpen) {
    accumulator = 0;
    return;
  }
  const wasExpanded = minimap.expanded;
  if (kb.takeOverview()) minimap.toggle();
  if (minimap.expanded || wasExpanded) {
    // The close frame is quiet too: only fresh gameplay input resumes movement.
    accumulator = 0;
    minimap.update(state, facing.yaw(state.player.stage));
    return;
  }
  camera.orbit(kb.orbit() * ORBIT_KEY_RATE * controls.values.sensitivity * dt);
  if (kb.takeRecenter()) camera.recenter(facing.yaw());
  if (state.outcome.kind === "cleared") {
    // The core ignores input once cleared; the restart press starts a new game from the view layer.
    if (kb.takeRestart()) {
      state = createInitialState(LEVEL);
      viewAlong("start");
      clearInputs();
    }
    accumulator = 0;
  } else {
    const r = advance(state, accumulator, frameSeconds, takeFrame, LEVEL);
    state = r.state;
    accumulator = r.accumulator;
    hud.onEvents(r.events, now);
    const loaded = r.events.find((e) => e.kind === "restored");
    if (loaded?.kind === "restored") {
      viewAlong(loaded.id);
      clearInputs();
    }
    // Growth keeps the facing and the view angles; the camera blends to the new stage's profile.
    if (r.events.some((e) => e.kind === "grew")) scene.growthCue(now);
  }
  if (state.outcome.kind !== lastOutcome) {
    lastOutcome = state.outcome.kind;
    clearInputs();
    updateCapture();
  }
  touchUi.syncRun();
  if (import.meta.env.DEV) hud.setDevWarnings(checkInvariants(state));
  const view = deriveView(state, LEVEL);
  facing.update(view);
  const focus = scene.positionCharacters(view, now, facing);
  const obstacles = obstaclesFor(LEVEL, state.doors);
  const pose = camera.update(view.active, focus, dt, obstacles);
  const target = interactTarget(state, LEVEL);
  const shown = target ? { ...target, label: touchMode ? target.label : `E：${target.label}` } : null;
  const place = scene.render(view, pose, false, { target: shown, enabled: help.enabled, margin: touchMode ? MARGIN.touch : MARGIN.desktop });
  hud.setPrompt(place === "hud" && shown ? shown.label : null);
  touchUi.setLabel(target?.label ?? null);
  touchUi.setStage(state.player.stage);
  hud.update(state, LEVEL, now);
  minimap.update(state, facing.yaw(view.active));
}
scene.renderer.setAnimationLoop(frame);
