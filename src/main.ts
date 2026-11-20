// Browser entry: fixed 60 Hz logic, render at display rate.
import { createInitialState } from "./core/initialState";
import { checkInvariants } from "./core/invariants";
import type { GameState } from "./core/types";
import { attachKeyboard, KeyboardState } from "./input/keyboard";
import { LEVEL } from "./level/layout";
import { advance } from "./loop";
import { FollowCamera } from "./view/camera";
import { deriveView } from "./view/deriveView";
import { Hud } from "./view/hud";
import { GameScene } from "./view/scene";

const app = document.getElementById("app")!;
const hudRoot = document.getElementById("hud")!;

const scene = new GameScene(app, LEVEL);
const hud = new Hud(hudRoot);
const camera = new FollowCamera();
const kb = new KeyboardState();
attachKeyboard(kb);

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

function frame(nowMs: number): void {
  const frameSeconds = (nowMs - last) / 1000;
  last = nowMs;
  const now = nowMs / 1000;

  if (kb.takeOverview()) camera.toggleOverview();

  if (state.outcome.kind === "cleared") {
    // The core ignores input once cleared; R starts a new game from the view layer.
    if (kb.takeFrame(false).restart) state = createInitialState(LEVEL);
    accumulator = 0;
  } else {
    const r = advance(state, accumulator, frameSeconds, (s) => kb.takeFrame(s.dialog !== null), LEVEL);
    state = r.state;
    accumulator = r.accumulator;
    hud.onEvents(r.events, now);
  }
  if (import.meta.env.DEV) hud.setDevWarnings(checkInvariants(state));

  const view = deriveView(state, LEVEL);
  const pose = camera.update(view.active, view.focus, Math.min(frameSeconds, 0.1));
  scene.render(view, pose, now);
  hud.update(state, LEVEL, now, camera.isOverview);
}

scene.renderer.setAnimationLoop(frame);
