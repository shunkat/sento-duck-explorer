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
- [ ] 7. Codex review fix: blended camera poses ignored walls and the ceiling (`camera.ts` lerped toward the final pose)
  - [ ] 7.1 Fixed in code: switch blend goes through `safeEye` every frame; C cuts instead of blending. Regression tests through `FollowCamera.update` (4 switches across walls/hole/pond, C return; 30–40 frames each) fail on the old code and pass now. Open until verifier B re-checks.
- [ ] 8. Review round 3 (B's N-1 and the Conductor's list)
  - [x] 8.1 N-1: input yaw latched while move keys are held; tests with held D, held A, W then W+D over 600 frames, latch release — Req 1.6
  - [x] 8.2 Camera yaw, latch and facing reset on checkpoint load and new game (`CHECKPOINT_VIEW_YAW`) — Req 1.7
  - [x] 8.3 D-1: start view toward the NarrowHole; near-lens fade of other characters; tests — Req 7.4
  - [x] 8.4 D-4: label declutter by priority; tests — Req 7.3
  - [x] 8.5 Sauna door view (Child unlocking) checked by test, locked and unlocked
  - [x] 8.6 PR #3 `measured === null` test noted in the integration plan (step 7)
  - [x] 8.7 Duck and hat GLBs connected after merging `origin/main` `09cdfe9` (hashes confirmed by the Conductor); `tests/assets.test.ts` checks hash, size, Duck bounds and sockets, hat on socket with rotation and scale
- [x] 9. Review round 4 (B's `.local/shoulder-review3.md`)
  - [x] 9.1 N-4: orbit steers a walk; test — Req 1.6
  - [x] 9.2 N-6: body between camera and controlled character fades (`bodyOpacity`); test at the Child start — Req 7.4
  - [x] 9.3 N-5: declutter moves labels instead of hiding them; route rooms ranked up; overview names not cut by walls; tests — Req 7.3
  - [ ] 9.4 Browser with held keys: hat on shelf → Child → Duck → carried; Codex
- [ ] 5. Verification
  - [x] 5.1 `npm test` 116 passed (84 before + 32 new), `npm run build`, publication check on the tree and `dist` PASS
  - [ ] 5.2 Browser: Crew single-key checks done (page renders in the shoulder view with Duck in front; Tab to Child shows Child's back with Adult ahead; C shows the cutaway overview and C returns). Not run: walking, orbit with J / L held, the NarrowHole, sauna, hat, carrying and pond in the shoulder view. These need held keys and are left to Codex via live takeover.
  - [x] 5.3 Pointed `prototype-core-gameplay/design.md` camera line to this spec
- Not in this plan: final models (final-assets pipeline), merging PR #3, held-key playthrough.

## Known issues

- Some zone labels are partly hidden by the cut walls in the Overview because zone labels are now depth-tested.
- D-4 and D-1: fixed in round 3 (tasks 8.3, 8.4). In the overview a lower-priority label may now be hidden instead of overlapping.
- Fixed: pond rocks drawn 1.0 m (they still block the camera); Overview maps W to up the map (F-3, `FollowCamera.moveYaw`, tested); final-assets wall height noted as open there (F-4).
