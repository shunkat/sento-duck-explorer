# Implementation Plan: Shoulder View

Created 2026-11-20 by the Crew implementer (Kiro Crew worker) directly from the user's request relayed by the Conductor. Status words: `[ ]` open, `[x]` done and tested. Codex completed the version-specific normal-input checks recorded in 5.2 and `docs/shoulder-view-verification.md`.

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
- [x] 4. Model entry point (normal-input results in 5.2)
  - [x] 4.1 `CHARACTER_MODEL_URLS` (`src/view/modelEntry.ts`), `GameScene.setCharacterModel`, lazy `GLTFLoader` in `main.ts` with fallback and warning — Req 6.1–6.4
  - [x] 4.2 `modelRotationY` tested against the +Z front. The root offset (`centerY − radius` / `centerY − height / 2`) lives in `setCharacterModel` and is not unit-tested (needs WebGL).
  - [x] 4.3 Load a real GLB in the browser: Duck rendered and moved during Codex's held-key smoke check. Human textures and route validation are recorded in 10.4/5.2.
  - [x] 4.4 Hat at `socket_hat` with world position and rotation (`placeAtSocket`, wired in `GameScene.render`); test in `tests/shoulder.test.ts` — Req 6.5
  - [x] 4.5 Concrete model connection plan and PR #3 unification steps in `design.md`; CC BY 4.0 credit need recorded — Req 6.6
  - [x] 4.6 Duck registered with CC BY 4.0 credit; live shoulder-view rendering and movement checked by Codex
- [x] 6. Review fixes (verifier B, `e1cf59c`)
  - [x] 6.1 F-1: camera eases behind the moving character; orbit hold 1 s; tests in `tests/shoulder.test.ts` — Req 1.5
  - [x] 6.2 D-2: Child and Adult look point lowered so the body is in frame
  - [x] 6.3 D-3: key-help panel moved to the bottom right (the over-right-shoulder view puts the character left of center)
  - [x] 6.4 F-2: checked, no change. `#hud` has `pointer-events: none`, inherited by every panel, so a drag that starts over the HUD reaches the canvas. Not tested with a real drag.
- [x] 7. Codex review fix: blended camera poses ignored walls and the ceiling (`camera.ts` lerped toward the final pose)
  - [x] 7.1 Fixed in code: switch blend goes through `safeEye` every frame; C cuts instead of blending. Regression tests through `FollowCamera.update` (4 switches across walls/hole/pond, C return; 30–40 frames each) fail on the old code and pass now. Independently rechecked by Codex; Kiro B's final verification was interrupted and is not counted as completed.
- [x] 8. Review round 3 (B's N-1 and the Conductor's list)
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
  - [x] 9.4 Browser with held keys: hat on shelf → Child → Duck → carried; Codex, `a72b765`
- [x] 11. Item labels vs small models (Kiro, after the normal-input run)
  - [x] 11.1 `itemLabelShown`: held/worn item labels hidden in the shoulder view; overview keeps them — Req 7.5
  - [x] 11.2 Item labels bottom-anchored at `ITEM_LABEL_Y` 0.25 m, above the hat model top — Req 7.5
  - [x] 11.3 Tests in `tests/assets.test.ts` (fail on the previous labels/scene code)
  - [ ] 11.4 Browser check of held/equipped hat and key without labels: Codex
    - Follow-up on `5a7866f`: equipped hat and carried Duck/hat observed in shoulder views. Held-hat mesh was obscured by wall/HUD; held-hat/key label checks remain incomplete. Full interaction route cleared.
- [x] 12. Towel display (simpler controls, Kiro Crew)
  - [x] 12.1 Provisional towel mesh per human as a child of the character group; `towelPose` from head top (model bounds) or `socket_hand_r` — Req 7.6
  - [x] 12.2 Locker sign says E; key help and README updated
  - [x] 12.3 Browser check of the towel on head / hand with the models: Codex, fixed `5a7866f`. Both hand towels connected to hands; Child head/hand toggle, clothed Adult head towel, carried Duck/hat with Adult head towel, and `paidReturned` towel restore observed. See `docs/shoulder-view-verification.md`.
- [x] 5. Verification
  - [x] 5.1 Kiro round 4: 116 tests passed. Codex human-connection follow-up: 122 tests passed, `npm run build` passed; publication checks on source/index and `dist` passed. These are not full-route gameplay results.
  - [x] 5.2 Browser: full route, human textures/outfits, narrow hole, sauna, held/equipped/carried hat, pond, six failure conditions and four restores passed on `a72b765`. F3 and subsequent ordinary walking passed after the input-only change `461ca315`. Overview assisted positioning; see `docs/shoulder-view-verification.md` for exact scope.
  - [x] 5.3 Pointed `prototype-core-gameplay/design.md` camera line to this spec
- Asset production is recorded in the final-assets pipeline; merging PR #3 remains outside this branch. Codex performed the held-key playthrough recorded in 5.2.

## Codex integration assistance after the Crew network interruption

A/B stopped editing after repeated network errors, preserving `72bdbe8` and A's `humanModel.ts`/clothing-view changes. Codex retained those changes and completed the following small connection work. Kiro remains the author of the camera, input, scene and game implementation; these follow-up changes are attributed to Codex.

- [x] 10.1 Register the actual Child/Adult GLBs with their CC BY 4.0 sidecars; keep `head_shared` optional because each outfit includes its own head
- [x] 10.2 Select exactly one outfit before first draw and on ClothingState changes; retain primitives if validation/load fails
- [x] 10.3 Put held items on human hand sockets, and Duck's bottom on Adult's `socket_carry` with its world position and rotation; preserve core ownership and positions
- [x] 10.4 Actual human textures, clothing changes and hand/hat/carry attachments visually checked in the normal-input run (`a72b765`)
- [x] 10.5 Two Codex reviewers independently checked the connection diff and asset-registration tests, with no required findings. This is separate from the interrupted Kiro B verification

## Known limitations

- Human meshes are static. Shared skeleton and walking/carry/wiping animation are not implemented.
- Environment geometry and small props other than the sauna hat remain primitives.
- PR #3 merge integration unifies ModelLibrary with the existing model setters. Facing, outfit selection and socket placement retain the Crew paths; the loader integration is checked automatically, without repeating the recorded playthrough.
- Full normal-input results and version boundaries are recorded in `docs/shoulder-view-verification.md`.
- Earlier label, input-yaw feedback and camera clipping issues were fixed in review rounds 3/4; confirm their user-visible behavior in the full playthrough.

## Independent review fixes after integrated-model smoke

- Codex independently found that an already opaque material could ignore a later fade because its OPAQUE shader was retained. The transparent/opaque transition now requests shader recompilation; material-version and label-exclusion regressions cover it.
- Off-axis label scale used Euclidean distance instead of projection depth, causing actual sprites to exceed their declutter bounds. Rendering now uses camera-forward depth and rejects labels behind/outside the camera planes. Projection regressions cover the off-axis case.
- Updated the stale incoming-Duck and held-hat descriptions to the actual four-asset connection.
- Earlier `4bbc76d` observations (F1/R, human bath display and narrow-hole shoulder inspection) remain partial-version evidence; later route and recovery results are recorded separately in 5.2.
- Carried-Duck camera focus now uses the actual positioned model center and elevation; checkpoint resets discard the previous camera pose before the first frame. Equipped fallback hats also follow the actual Duck group if its GLB is missing.
- Both independent Codex reviewers reran their concrete reproductions after the fixes and reported no remaining required findings. Their checks are code/math checks, separate from live gameplay.
- Before the input follow-up, 127 tests and the build passed. The final automated count is 136; the normal-input evidence and version boundaries are recorded below.

## Final input follow-up

`461ca315` accepts Shift modifiers on movement events as well as independent ShiftLeft/ShiftRight events and clears that fallback on release/focus loss/detach. Actual CUA Shift+D produced F3; R restored start; a subsequent ordinary walk crossed the same soap without F3. Final automated count: **136 passed**, with production build and publication checks passing. The full route and other failure/recovery cases were observed on `a72b765`; the input follow-up is recorded separately.


## Persistent minimap — 2026-11-22

- [x] Always-visible north-up map and expanded native dialog, authored by Kiro Crew; LEVEL geometry, current position/facing, remaining milk and door state.
- [x] Codex integration: C opens the map without changing the shoulder camera; open/close boundaries clear held/pending input and mouse capture, pause the fixed-step loop and discard elapsed time; responsive HUD/CSS and current Japanese/English instructions.
- [x] Independent implementation review: no Required finding; narrow-screen safe-area advisory applied.
- [x] Integrated automatic checks: 278 cases across 30 files accounted for after the targeted HUD expectation correction; TypeScript/production build passed. See `docs/minimap-verification.md`.
- [ ] One final normal-input verification slot for the whole minimap batch, including map open/close, input pause/resume, compact/fullscreen layouts and the growth-to-street route.
- [ ] Publish the checked revision through the existing main/Pages workflow.

The separate outdoor-bath WIP is not included in this branch. Its unfinished bathing logic and verification remain recorded on that branch; this map change does not mark them complete. This feature changes no assets or licensing and does not claim hackathon submission or category acceptance.
