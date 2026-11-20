// Browser entry: fixed 60 Hz logic, render at display rate.
import { createInitialState } from "./core/initialState";
import { checkInvariants } from "./core/invariants";
import type { CharacterId, GameState } from "./core/types";
import { attachKeyboard, KeyboardState } from "./input/keyboard";
import { LEVEL } from "./level/layout";
import { advance } from "./loop";
import { FollowCamera } from "./view/camera";
import { deriveView } from "./view/deriveView";
import { Hud } from "./view/hud";
import { CHARACTER_MODEL_URLS } from "./view/modelEntry";
import { GameScene } from "./view/scene";
import { cameraRelativeMove, FacingTracker, ORBIT_DRAG_RATE, ORBIT_KEY_RATE, obstaclesFor } from "./view/shoulder";

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
const modelEntries = Object.entries(CHARACTER_MODEL_URLS) as [CharacterId, string][];
if (modelEntries.length > 0) {
  void import("three/addons/loaders/GLTFLoader.js").then(({ GLTFLoader }) => {
    const loader = new GLTFLoader();
    for (const [id, url] of modelEntries) {
      loader.loadAsync(url).then(
        (gltf) => scene.setCharacterModel(id, gltf.scene),
        (e) => console.warn(`Model for ${id} could not be loaded from ${url}; keeping the placeholder.`, e),
      );
    }
  });
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

/** WASD is relative to the camera's yaw (shoulder-view Req 3.1). */
const takeFrame = (s: GameState) => {
  const f = kb.takeFrame(s.dialog !== null);
  return { ...f, move: cameraRelativeMove(f.move, camera.yaw) };
};

function frame(nowMs: number): void {
  const frameSeconds = (nowMs - last) / 1000;
  last = nowMs;
  const now = nowMs / 1000;
  const dt = Math.min(frameSeconds, 0.1);

  if (kb.takeOverview()) camera.toggleOverview();
  camera.orbit(kb.orbit() * ORBIT_KEY_RATE * dt);

  if (state.outcome.kind === "cleared") {
    // The core ignores input once cleared; R starts a new game from the view layer.
    if (kb.takeFrame(false).restart) state = createInitialState(LEVEL);
    accumulator = 0;
  } else {
    const r = advance(state, accumulator, frameSeconds, takeFrame, LEVEL);
    state = r.state;
    accumulator = r.accumulator;
    hud.onEvents(r.events, now);
  }
  if (import.meta.env.DEV) hud.setDevWarnings(checkInvariants(state));

  const view = deriveView(state, LEVEL);
  facing.update(view);
  const pose = camera.update(view.active, view.focus, dt, facing.yaw(view.active), obstaclesFor(LEVEL, state.saunaDoor), facing.moving(view.active));
  scene.render(view, pose, now, facing, camera.isOverview);
  hud.update(state, LEVEL, now, camera.isOverview);
}

scene.renderer.setAnimationLoop(frame);
