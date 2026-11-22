// Browser entry: fixed 60 Hz logic, render at display rate.
import { createInitialState } from "./core/initialState";
import { checkInvariants } from "./core/invariants";
import type { CharacterId, CheckpointId, GameState } from "./core/types";
import { attachKeyboard, KeyboardState } from "./input/keyboard";
import { LEVEL } from "./level/layout";
import { advance } from "./loop";
import { FollowCamera } from "./view/camera";
import { deriveView } from "./view/deriveView";
import { Hud } from "./view/hud";
import { MiniMap } from "./view/minimap";
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

// Mouse drag turns the view (view only).
let dragX: number | null = null;
let dragPointer: number | null = null;
const canvas = scene.renderer.domElement;
canvas.addEventListener("pointerdown", (e) => {
  if (minimap.expanded) return;
  dragX = e.clientX;
  dragPointer = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragX === null || minimap.expanded) return;
  camera.orbit((e.clientX - dragX) * ORBIT_DRAG_RATE);
  dragX = e.clientX;
});
const endDrag = () => {
  if (dragPointer !== null && canvas.hasPointerCapture(dragPointer)) canvas.releasePointerCapture(dragPointer);
  dragX = null;
  dragPointer = null;
};
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);
canvas.addEventListener("lostpointercapture", endDrag);
window.addEventListener("blur", endDrag);

// Final models, when any are listed. A failure keeps the primitive.
const charEntries = Object.entries(CHARACTER_MODEL_URLS) as [CharacterId, string][];
const itemEntries = Object.entries(ITEM_MODEL_URLS) as [string, string][];
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
const minimap = new MiniMap(document.getElementById("map")!, LEVEL, () => {
  kb.blur();
  endDrag();
  camera.setMoveHeld(false);
  accumulator = 0;
  last = performance.now();
});
attachKeyboard(kb, window, () => !minimap.expanded);

const resize = () => scene.resize(window.innerWidth, window.innerHeight);
window.addEventListener("resize", resize);
resize();

// After the tab was hidden, do not replay the gap.
document.addEventListener("visibilitychange", () => {
  last = performance.now();
  accumulator = 0;
});

/** WASD remains relative to the shoulder camera; the map never changes that camera. */
const takeFrame = () => {
  const f = kb.takeFrame();
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

  const wasExpanded = minimap.expanded;
  if (kb.takeOverview()) minimap.toggle();
  if (minimap.expanded || wasExpanded) {
    // Discard elapsed time and all gameplay input while reading the map.
    // The close frame is also quiet; only a new input can resume movement.
    accumulator = 0;
    minimap.update(state, facing.yaw(state.player.stage));
    return;
  }
  camera.orbit(kb.orbit() * ORBIT_KEY_RATE * dt);
  camera.setMoveHeld(kb.moveHeld());

  if (state.outcome.kind === "cleared") {
    // The core ignores input once cleared; R starts a new game from the view layer.
    if (kb.takeFrame().restart) {
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
    // Growth keeps the facing; the camera blends to the new stage's profile.
    if (r.events.some((e) => e.kind === "grew")) scene.growthCue(now);
  }
  if (import.meta.env.DEV) hud.setDevWarnings(checkInvariants(state));

  const view = deriveView(state, LEVEL);
  facing.update(view);
  const focus = scene.positionCharacters(view, now, facing);
  const pose = camera.update(view.active, focus, dt, facing.yaw(view.active), obstaclesFor(LEVEL, state.doors), facing.moving(view.active));
  scene.render(view, pose, false);
  hud.update(state, LEVEL, now);
  minimap.update(state, facing.yaw(view.active));
}

scene.renderer.setAnimationLoop(frame);
