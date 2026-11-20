# Implementation Plan

Scope: placeholder-model prototype only. Completing these tasks does not complete the final models; the mandatory "image → Image to 3D → Blender adjustment → game integration" pipeline is a later spec. No deployment, publishing, or paid services in this plan.

Created directly by the main Kiro agent on 2026-11-20 after the built-in spec sub-agent failed twice (per `.kiro/steering/project-autonomy.md`).

- [x] 1. Set up the project
  - Create `package.json`, `tsconfig.json` (strict), `vite.config.ts`, `index.html`, `.gitignore`
  - Dependencies: `three`, dev: `typescript`, `vite`, `vitest`, `fast-check`, `@types/three`
  - Scripts: `dev`, `build` (`tsc --noEmit && vite build`), `test` (`vitest --run`)
  - _Requirements: 9.7_

- [x] 2. Core types, geometry, and level data
  - [x] 2.1 Write `src/core/types.ts` with `GameState`, `ItemState`, `Owner`, `InputFrame`, `GameEvent`, `ViolationId`, `CheckpointId`
    - `carriedBy: "adult" | null`; `dialog` limited to the two allowlisted transfers
    - _Requirements: 3.10, 5.1, 5.9_
  - [x] 2.2 Write `src/sim/geometry.ts` and `src/sim/collision.ts` (circle vs. AABB on the XZ plane)
    - _Requirements: 2.1–2.4_
  - [x] 2.3 Write `src/level/layout.ts` with zones, walls, doors, `PAIR_DOORS`, nodes, NPC boxes, soap, spawn and checkpoint markers in meters
    - NarrowHole 0.40 m, CrowdGaps 0.60 m ×3, doors 1.20 m; pond with two rocks
    - _Requirements: 2.1–2.4, 8.3, 9.2–9.4_
  - [x] 2.4 Write `src/sim/zones.ts` (zone lookup) and `src/core/initialState.ts`
    - _Requirements: 3.1_
  - [x]* 2.5 Unit tests for collision against the NarrowHole and CrowdGaps per character size
    - **Property 5: Size gates passage**
    - **Validates: Requirements 2.1–2.4, 9.3, 9.4**

- [x] 3. Tick pipeline and actions
  - [x] 3.1 Write `src/core/tick.ts` with the 7 stages; a switch tick returns after the switch stage
    - _Requirements: 1.2, 1.3, 1.5, 1.7, 10.2_
  - [x] 3.2 Write `src/core/actions.ts`: coin pickup, give via `TRANSFER_ALLOWLIST` with dialog confirm/cancel, pay, unlock, hat pickup, Equip Hat, Adult-only pick up / put down / place in pond, dry, dress/undress
    - _Requirements: 3.2–3.11, 4.3–4.7, 5.2, 5.8, 5.9, 6.4, 6.6, 6.8_
  - [x] 3.3 Write `src/core/pair.ts`: pair-door crossing, join radius 3.0 m, companion entry checks and blocking prompts
    - _Requirements: 4.9–4.12_
  - [x] 3.4 Write `src/sim/movement.ts` and `src/sim/pond.ts`; pond physics only when `duck.inPond && active === "duck"`
    - _Requirements: 2.5, 2.6, 8.1–8.5_
  - [x] 3.5 Write `src/core/rules.ts`: wet rules, F1–F7 detection, clear detection, game-over priority
    - _Requirements: 6.3, 6.5, 7.1–7.9, 3.13–3.15_
  - [x] 3.6 Write `src/core/invariants.ts` (`checkInvariants`)
    - _Requirements: 5.1, 5.10, 10.3–10.5_
  - [x]* 3.7 Unit tests for each action, each F1–F7 trigger and non-trigger, pair-door blocking, and switch tick vs. next tick in the pond
    - _Requirements: 1.7, 1.8, 4.1–4.12, 7.1–7.8_

- [x] 4. Checkpoints and restart
  - [x] 4.1 Write `src/core/checkpoints.ts`: snapshot, restore, triggers for `start`, `paidReturned`, `hatEquipped`, `duckInPond` (end of placement tick, both humans in `pond_entrance`), safe spawn normalization
    - _Requirements: 5.4, 6.9, 10.3–10.8_
  - [x]* 4.2 Unit tests: each checkpoint's trigger and restore; idle tick after restore does not game over
    - _Requirements: 10.7, 10.8_

- [x] 5. Scripted full-route test
  - [x] 5.1 Write `tests/route.test.ts`: input script from start to `cleared` through all 10 steps, asserting state after each step, including pair doors to reception and to the pond
    - _Requirements: 3.1–3.15, 4.1–4.12, 8.3, 9.7_
  - [x] 5.2 Fix logic or layout until the route test passes

- [x] 6. Checkpoint: run `npx vitest --run` and `npx tsc --noEmit`; fix failures

- [x] 7. Property-based tests (fast-check, ≥100 runs each)
  - [x]* 7.1 Random input sequence generator biased toward interaction points; reuse route prefixes to reach later stages
    - Done in `tests/helpers/props.ts` (reachable stages built from the scripted route, held-direction frame generator) and `tests/properties.test.ts` (one test per property, `numRuns` 100 or more; Properties 2, 4, 6, 8, 17, 19 have extra sub-tests). Property 5 stays in `tests/level.test.ts` and Property 15 in `tests/view.test.ts`. No defect in `src/` was found by these properties. Properties 9, 10, 13 and the negative case of 8 start from states built by editing a reachable state (for example a wet human, or Duck already in the goal), because random play does not reach them reliably.
  - [x]* 7.2 **Property 1: Item uniqueness and invariants hold** — **Validates: Requirements 5.1, 5.3, 10.3–10.5**
  - [x]* 7.3 **Property 2: Switching rotates and preserves state** — **Validates: Requirements 1.2, 1.6, 1.7, 5.5, 10.1**
  - [x]* 7.4 **Property 3: Switching is blocked during dialogs and game over** — **Validates: Requirements 1.5**
  - [x]* 7.5 **Property 4: Inactive characters stay still** — **Validates: Requirements 1.3, 1.8, 8.5**
  - [x]* 7.6 **Property 6: Carried Duck follows Adult** — **Validates: Requirements 2.5, 2.6, 3.10**
  - [x]* 7.7 **Property 7: Cancelled transfers restore ownership** — **Validates: Requirements 5.2**
  - [x]* 7.8 **Property 8: Clear requires the hat-wearing Duck in the goal** — **Validates: Requirements 3.13–3.15, 8.4**
  - [x]* 7.9 **Property 9: Game over takes priority over clear** — **Validates: Requirements 7.9**
  - [x]* 7.10 **Property 10: State-based violations fire on entry** — **Validates: Requirements 4.1, 4.2, 4.4, 7.2, 7.4, 7.5**
  - [x]* 7.11 **Property 11: Walking never triggers F7** — **Validates: Requirements 7.7, 7.8**
  - [x]* 7.12 **Property 12: Game over freezes the game** — **Validates: Requirements 10.2**
  - [x]* 7.13 **Property 13: Checkpoint restore is consistent** — **Validates: Requirements 5.4, 6.9, 10.3–10.5**
  - [x]* 7.14 **Property 14: Wet and clothing states are independent** — **Validates: Requirements 6.1, 6.2, 6.7, 6.8**
  - [x]* 7.15 **Property 16: Only allowlisted transfers; hat moves only by Equip** — **Validates: Requirements 3.3, 3.5, 3.9, 5.8–5.10**
  - [x]* 7.16 **Property 17: Pond physics advances only while Duck is active** — **Validates: Requirements 1.8, 8.1, 8.2, 8.5**
  - [x]* 7.17 **Property 18: Pair doors keep Child with Adult** — **Validates: Requirements 4.9–4.12**
  - [x]* 7.18 **Property 19: duckInPond checkpoint requires both humans on the shore** — **Validates: Requirements 3.11, 10.7**

- [x] 8. View, input, and HUD
  - [x] 8.1 Write `src/view/deriveView.ts` (pure state → view model, `hatAttachedToDuck`)
    - _Requirements: 9.1, 9.5, 10.6_
  - [ ]* 8.2 **Property 15: View reflects the hat state** — **Validates: Requirements 10.6**
    - Not done as a fast-check property. `tests/view.test.ts` checks it on every tick of a real full-route playthrough instead.
  - [x] 8.3 Write `src/view/scene.ts` (Three.js primitives, zone boxes, text labels) and `src/view/camera.ts` (follow camera, 0.4 s switch transition, low Duck offset)
    - _Requirements: 1.4, 9.1, 9.2, 9.5_
    - Label sizing fix after Codex's Chrome check: `src/view/labels.ts` targets 12–22 CSS px and hides the active character's own label; re-checked by Codex in the low view and overview
  - [x] 8.4 Write `src/input/keyboard.ts` and `src/view/hud.ts` (state panel, prompts, GameOverScreen, clear screen) and `src/core/text.ts` (Japanese strings, item fiction, manners)
    - Also `src/core/guide.ts` (objective and nearby keys)
    - _Requirements: 5.6, 5.7, 7.10, 9.6_
  - [x] 8.5 Write `src/main.ts`: fixed 60 Hz loop with accumulator, max 5 ticks per frame, dev-build invariant check
    - Loop logic in `src/loop.ts`; focus loss clears keys
    - _Requirements: 1.6, 10.1_

- [ ] 9. Final verification
  - [x] 9.1 Run `npm run build` and `npx vitest --run`; fix failures
  - [ ] 9.2 Start the local dev server and record the local URL; manual checklist: camera switch, shapes and colors, HUD, labels
    - Done: dev server at http://127.0.0.1:5173/. Partly checked by Codex in Chrome (first half of the route up to paying at reception, F1 and restart, and the label fix; see `progress.md`). Open: the second half of the route, camera transition feel, and F2–F7 screens in the browser. This is not a user-approval checkpoint.
    - Browser verification of the second half of the route and F2–F7 remains unverified: the browser tool could not reach the local server on 2026-11-20. The logic is covered by `tests/route.test.ts` and `tests/properties.test.ts` only.
  - [x] 9.3 Record in the spec which Kiro features were used and what remains (final-model pipeline is still required)
    - See `progress.md`
