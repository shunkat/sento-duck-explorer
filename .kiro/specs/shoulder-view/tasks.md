# Implementation Plan: Shoulder View

Created 2026-11-20 by the Crew implementer (Kiro Crew worker) directly from the user's request relayed by the Conductor. Status words: `[ ]` open, `[x]` done and tested. A held-key playthrough has not been run; see 5.2.

- [x] 1. Pure camera math in `src/view/shoulder.ts`
  - [x] 1.1 Yaw helpers, `cameraRelativeMove`, `yawFromDirection` — Req 3.1, 3.3
  - [x] 1.2 `CAMERA_PROFILE`, `clipSegment`, `shoulderPose` with obstacle clip, ceiling and hole-lid clamp — Req 1.1, 1.2, 4.1, 4.2
    - Added a third clip (character → eye) so the line of sight stays clear; found by the sampled test at a sauna crowd gap.
  - [x] 1.3 `FacingTracker` (view-only facing, carried Duck follows Adult, jumps over 0.5 m per frame ignored) — Req 3.4
  - [x] 1.4 Tests in `tests/shoulder.test.ts` (9 tests)
- [x] 2. Camera and input wiring
  - [x] 2.1 `FollowCamera`: yaw, orbit, align on switch, blend 0.4 s; Overview unchanged — Req 1.3, 2.1, 5.1
  - [x] 2.2 `KeyboardState.orbit()` for held J / L; mouse drag in `main.ts` — Req 2.1, 2.2, 2.3
  - [x] 2.3 `main.ts`: rotate move input by yaw before `advance` — Req 3.1, 3.2
  - [x] 2.4 Old camera tests moved to the new profiles (`tests/view.test.ts`, `tests/labels.test.ts`); HUD key help updated
- [x] 3. Display (no WebGL test; checked by build and the browser screenshots in 5.2)
  - [x] 3.1 2.6 m walls, indoor ceilings, NarrowHole lid and lintel; Overview cutaway — Req 4.3
  - [x] 3.2 Characters turned to Facing; front marker on human primitives; beak at +Z; carried Duck 0.3 m in front of Adult — Req 1.4, 4.4
  - [x] 3.3 Zone and fixture labels depth-tested — Req 7.2
- [ ] 4. Model entry point (4.3 open)
  - [x] 4.1 `CHARACTER_MODEL_URLS` (empty, `src/view/modelEntry.ts`), `GameScene.setCharacterModel`, lazy `GLTFLoader` in `main.ts` with fallback and warning — Req 6.1–6.4
  - [x] 4.2 `modelRotationY` tested against the +Z front. The root offset (`centerY − radius` / `centerY − height / 2`) lives in `setCharacterModel` and is not unit-tested (needs WebGL).
  - [ ] 4.3 Load a real GLB in the browser. Blocked until a final model exists (final-assets pipeline; Codex handles images, service and rights). No GLB was loaded in this round.
  - [x] 4.4 Hat at `socket_hat` with world position and rotation (`placeAtSocket`, wired in `GameScene.render`); test in `tests/shoulder.test.ts` — Req 6.5
  - [x] 4.5 Concrete model connection plan and PR #3 unification steps in `design.md`; CC BY 4.0 credit need recorded — Req 6.6
  - [ ] 4.6 When `public/models/duck.glb` arrives: add it to `CHARACTER_MODEL_URLS`, add the CC BY 4.0 credit, check in the browser
- [x] 6. Review fixes (verifier B, `e1cf59c`)
  - [x] 6.1 F-1: camera eases behind the moving character; orbit hold 1 s; tests in `tests/shoulder.test.ts` — Req 1.5
  - [x] 6.2 D-2: Child and Adult look point lowered so the body is in frame
  - [x] 6.3 D-3: key-help panel moved to the bottom right (the over-right-shoulder view puts the character left of center)
  - [x] 6.4 F-2: checked, no change. `#hud` has `pointer-events: none`, inherited by every panel, so a drag that starts over the HUD reaches the canvas. Not tested with a real drag.
- [ ] 5. Verification
  - [x] 5.1 `npm test` 97 passed (84 before + 13 new), `npm run build`, publication check on the tree and `dist` PASS
  - [ ] 5.2 Browser: Crew single-key checks done (page renders in the shoulder view with Duck in front; Tab to Child shows Child's back with Adult ahead; C shows the cutaway overview and C returns). Not run: walking, orbit with J / L held, the NarrowHole, sauna, hat, carrying and pond in the shoulder view. These need held keys and are left to Codex via live takeover.
  - [x] 5.3 Pointed `prototype-core-gameplay/design.md` camera line to this spec
- Not in this plan: final models (final-assets pipeline), merging PR #3, held-key playthrough.

## Known issues

- Pond rocks are drawn as full-height walls (2.6 m) in the shoulder view. Lower them when the pond kit is planned.
- Some zone labels are partly hidden by the cut walls in the Overview because zone labels are now depth-tested.
- Overview labels still overlap each other (子ども/アヒル, サウナ室/人混み/ハット, 小さな穴/500円玉), and the small bodies are hard to find (review D-4). Needs a label layout pass; not small.
- Duck's start view is filled by the Child and Adult bodies (review D-1). Framing only; left as is.
- In the Overview the yaw is frozen, so W is camera-relative, not "up the map", when yaw ≠ 0 (review F-3).
