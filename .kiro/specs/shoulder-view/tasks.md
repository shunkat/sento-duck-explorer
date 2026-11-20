# Implementation Plan: Shoulder View

Created 2026-11-20 by the Crew implementer (Kiro Crew worker) directly from the user's request relayed by the Conductor. Status words: `[ ]` open, `[x]` done and tested.

- [ ] 1. Pure camera math in `src/view/shoulder.ts`
  - [ ] 1.1 Yaw helpers, `cameraRelativeMove`, `yawFromDirection` — Req 3.1, 3.3
  - [ ] 1.2 `CAMERA_PROFILE`, `clipSegment`, `shoulderPose` with obstacle clip, ceiling and hole-lid clamp — Req 1.1, 1.2, 4.1, 4.2
  - [ ] 1.3 `FacingTracker` (view-only facing, carried Duck follows Adult) — Req 3.4
  - [ ] 1.4 Tests in `tests/shoulder.test.ts`
- [ ] 2. Camera and input wiring
  - [ ] 2.1 `FollowCamera`: yaw, orbit, align on switch, blend 0.4 s; Overview unchanged — Req 1.3, 2.1, 5.1
  - [ ] 2.2 `KeyboardState.orbit()` for held J / L; mouse drag in `main.ts` — Req 2.1, 2.2, 2.3
  - [ ] 2.3 `main.ts`: rotate move input by yaw before `advance` — Req 3.1, 3.2
  - [ ] 2.4 Update the old camera tests and HUD key help
- [ ] 3. Display
  - [ ] 3.1 2.6 m walls, indoor ceilings, NarrowHole lid and lintel; Overview cutaway — Req 4.3
  - [ ] 3.2 Characters turned to Facing; front marker on human primitives; beak at +Z; carried Duck in front of Adult — Req 1.4, 4.4
  - [ ] 3.3 Zone and fixture labels depth-tested — Req 7.2
- [ ] 4. Model entry point
  - [ ] 4.1 `CHARACTER_MODEL_URLS` (empty), `GameScene.setCharacterModel`, GLTFLoader in `main.ts` with fallback and warning — Req 6.1–6.4
  - [ ] 4.2 Pure `modelRootY` / `modelRotationY` with tests
- [ ] 5. Verification
  - [ ] 5.1 `npm test` (≥ 84), `npm run build`, publication check on the tree and `dist`
  - [ ] 5.2 Browser single-key checks by Crew (render, C toggle, Tab switch alignment); record held-key play as not run
  - [ ] 5.3 Point `prototype-core-gameplay/design.md` camera line to this spec
- Not in this plan: final models (final-assets pipeline, Codex handles images and services), merging PR #3, held-key playthrough (Codex via live takeover).
