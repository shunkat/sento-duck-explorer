// Browser entry: fixed 60 Hz logic, render at display rate.
import { createInitialState } from "./core/initialState";
import { checkInvariants } from "./core/invariants";
import type { CharacterId, CheckpointId, GameState, ItemId } from "./core/types";
import { attachKeyboard, KeyboardState } from "./input/keyboard";
import { LEVEL } from "./level/layout";
import { advance } from "./loop";
import { FollowCamera } from "./view/camera";
import { deriveView } from "./view/deriveView";
import { Hud } from "./view/hud";
import { CHARACTER_MODEL_URLS, ITEM_MODEL_URLS, ENVIRONMENT_MODEL_URLS } from "./view/modelEntry";
import { GameScene } from "./view/scene";
import { CHECKPOINT_VIEW_YAW, cameraRelativeMove, FacingTracker, ORBIT_DRAG_RATE, ORBIT_KEY_RATE, obstaclesFor } from "./view/shoulder";

const app = document.getElementById("app")!;
const hudRoot = document.getElementById("hud")!;

const scene = new GameScene(app, LEVEL);
const hud = new Hud(hudRoot);
const camera = new FollowCamera();
const facing = new FacingTracker();
const kb = new KeyboardState();
attachKeyboard(kb);

// Mouse drag turns the view (view only).
let dragX: number | null = null;
const canvas = scene.renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
  dragX = e.clientX;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragX === null) return;
  camera.orbit((e.clientX - dragX) * ORBIT_DRAG_RATE);
  dragX = e.clientX;
});
const endDrag = () => (dragX = null);
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

// Final models, when any are listed. A failure keeps the primitive.
const charEntries = Object.entries(CHARACTER_MODEL_URLS) as [CharacterId, string][];
const itemEntries = Object.entries(ITEM_MODEL_URLS) as [ItemId, string][];
const modelEntries = [...charEntries, ...itemEntries, ...Object.entries(ENVIRONMENT_MODEL_URLS)];
if (modelEntries.length > 0) {
  void import("./view/models").then(({ ModelLibrary }) => {
    const models = new ModelLibrary();
    for (const [id, url] of modelEntries) {
      void models.load(id, import.meta.env.BASE_URL + url).then(() => scene.useModels(models));
    }
  }).catch((error) => console.warn("Model loader unavailable; keeping the placeholders.", error));
}

let state: GameState = createInitialState(LEVEL);
let accumulator = 0;
let last = performance.now();

const resize = () => scene.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", resize);
resize();

// After the tab was hidden, do not replay the gap.
document.addEventListener("visibilitychange", () => {
  last = performance.now();
  accumulator = 0;
});

/** WASD is relative to the camera's yaw; in the fixed overview W is up the map (shoulder-view Req 3.1, 3.2). */
const takeFrame = (s: GameState) => {
  const f = kb.takeFrame(s.dialog !== null);
  return { ...f, move: cameraRelativeMove(f.move, camera.moveYaw) };
};

/** Checkpoint load or new game: no stale camera yaw or facing (review N-1). */
function viewAlong(id: CheckpointId): void {
  camera.lookAlong(CHECKPOINT_VIEW_YAW[id]);
  facing.lookAlong(CHECKPOINT_VIEW_YAW[id]);
}
viewAlong("start");

function frame(nowMs: number): void {
  const frameSeconds = (nowMs - last) / 1000;
  last = nowMs;
  const now = nowMs / 1000;
  const dt = Math.min(frameSeconds, 0.1);

  if (kb.takeOverview()) camera.toggleOverview();
  camera.orbit(kb.orbit() * ORBIT_KEY_RATE * dt);
  camera.setMoveHeld(kb.moveHeld());

  if (state.outcome.kind === "cleared") {
    // The core ignores input once cleared; R starts a new game from the view layer.
    if (kb.takeFrame(false).restart) {
      state = createInitialState(LEVEL);
      viewAlong("start");
    }
    accumulator = 0;
  } else {
    const r = advance(state, accumulator, frameSeconds, takeFrame, LEVEL);
    state = r.state;
    accumulator = r.accumulator;
    hud.onEvents(r.events, now);
    const loaded = r.events.find((e) => e.kind === "restored");
    if (loaded?.kind === "restored") viewAlong(loaded.id);
  }
  if (import.meta.env.DEV) hud.setDevWarnings(checkInvariants(state));

  const view = deriveView(state, LEVEL);
  facing.update(view);
  const focus = scene.positionCharacters(view, now, facing);
  const pose = camera.update(view.active, focus, dt, facing.yaw(view.active), obstaclesFor(LEVEL, state.saunaDoor), facing.moving(view.active));
  scene.render(view, pose, camera.isOverview);
  hud.update(state, LEVEL, now, camera.isOverview);
}

scene.renderer.setAnimationLoop(frame);
