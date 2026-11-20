# Implementation Plan: Shoulder View

Created 2026-11-20 by the Crew implementer (Kiro Crew worker) directly from the user's request relayed by the Conductor. Status words: `[ ]` open, `[x]` done and tested. A short held-key smoke check was performed by Codex; the full route remains open (5.2).

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
- [x] 4. Model entry point (full gameplay validation remains open in 5.2)
  - [x] 4.1 `CHARACTER_MODEL_URLS` (`src/view/modelEntry.ts`), `GameScene.setCharacterModel`, lazy `GLTFLoader` in `main.ts` with fallback and warning — Req 6.1–6.4
  - [x] 4.2 `modelRotationY` tested against the +Z front. The root offset (`centerY − radius` / `centerY − height / 2`) lives in `setCharacterModel` and is not unit-tested (needs WebGL).
  - [x] 4.3 Load a real GLB in the browser: Duck rendered and moved during Codex's held-key smoke check. Human texture decoding and route validation remain in 10.4/5.2.
  - [x] 4.4 Hat at `socket_hat` with world position and rotation (`placeAtSocket`, wired in `GameScene.render`); test in `tests/shoulder.test.ts` — Req 6.5
  - [x] 4.5 Concrete model connection plan and PR #3 unification steps in `design.md`; CC BY 4.0 credit need recorded — Req 6.6
  - [x] 4.6 Duck registered with CC BY 4.0 credit; live shoulder-view rendering and movement checked by Codex
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
  - [x] 5.1 Kiro round 4: 116 tests passed. Codex human-connection follow-up: 122 tests passed, `npm run build` passed; publication checks on source/index and `dist` passed. These are not full-route gameplay results.
  - [ ] 5.2 Browser: Crew single-key checks plus Codex held W/L and Tab smoke on the earlier Duck/hat version. Full route, human textures/outfits, narrow hole, sauna, held/equipped/carried hat, pond, F1–F7 and four restarts require the fixed integrated version.
  - [x] 5.3 Pointed `prototype-core-gameplay/design.md` camera line to this spec
- Not in this plan: final models (final-assets pipeline), merging PR #3, held-key playthrough.

## Codex integration assistance after the Crew network interruption

A/B stopped editing after repeated network errors, preserving `72bdbe8` and A's `humanModel.ts`/clothing-view changes. Codex retained those changes and completed the following small connection work. Kiro remains the author of the camera, input, scene and game implementation; these follow-up changes are attributed to Codex.

- [x] 10.1 Register the actual Child/Adult GLBs with their CC BY 4.0 sidecars; keep `head_shared` optional because each outfit includes its own head
- [x] 10.2 Select exactly one outfit before first draw and on ClothingState changes; retain primitives if validation/load fails
- [x] 10.3 Put held items on human hand sockets, and Duck's bottom on Adult's `socket_carry` with its world position and rotation; preserve core ownership and positions
- [ ] 10.4 Verify actual human texture display, clothing changes and attachments in the browser. Structural GLB checks do not prove texture decoding or visual quality
- [x] 10.5 Two Codex reviewers independently checked the connection diff and asset-registration tests, with no required findings. This is separate from the interrupted Kiro B verification

## Known limitations

- Human meshes are static. Shared skeleton and walking/carry/wiping animation are not implemented.
- Environment geometry and small props other than the sauna hat remain primitives.
- The thin entry point and PR #3 ModelAdapter still need the unification described in `design.md`; PR #3 has not been merged.
- Full normal-input route and recovery checks remain open in 5.2.
- Earlier label, input-yaw feedback and camera clipping issues were fixed in review rounds 3/4; confirm their user-visible behavior in the full playthrough.
