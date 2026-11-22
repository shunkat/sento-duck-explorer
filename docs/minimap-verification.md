# Persistent minimap verification — 2026-11-22

The user requested an always-visible map that expands on tap. This revision adds a north-up SVG minimap at the top right and a viewport-size map dialog. C opens or closes the same dialog; Close and Escape return to the unchanged shoulder camera. The expanded map pauses gameplay and clears queued/held input, camera drag and elapsed-time accumulation. Native button activation does not interact with the game. The map reads LEVEL and game state for geometry, position/facing, remaining milk and two high-handle doors.

Base: `2538208abc766ea9f20757cd5a1491eeaec990c4`, branch `feat/persistent-minimap`. The separate outdoor-bath WIP is excluded, remains incomplete and is not represented as released here. No model, dependency, paid service or asset licence changes are included.

## Implementation and automatic evidence

Kiro Crew interactive chat authored `src/view/minimap.ts`, `tests/minimap.test.ts`, and the current requirements/design additions. Codex integrated the map with input, main loop, HUD and responsive styles, corrected the two-SVG test expectation and updated the current controls. The test invocation initially waited for a same-step file write; the documented next-step retry ran normally. No permission or security setting was changed.

- Kiro focused module run: 17 passed, one failed because the test expected one wall path across two SVGs. The corrected check verifies both static nodes are retained.
- Codex full `npm test`: 277 passed, one failed because the prior HUD test forbade Escape altogether. Escape now closes the map; the expectation still rejects retired Tab/transfer controls and requires Escape to belong to the map help. Targeted `tests/view.test.ts`: all seven passed afterward. All 278 cases across 30 files are accounted for by these runs; the whole suite was not unnecessarily repeated. All 18 minimap tests passed in the integrated run.
- `npm run build -- --base=/sento-duck-explorer/`: passed, including TypeScript. The existing bundle-size advisory remains. Subsequent changes before the verification commit are tests and documents only.
- Source/index preflight before work: PASS, 2,740 inspected, zero findings. Distribution preflight: PASS, 53 inspected, zero findings. These are heuristic text checks, not a guarantee about rights or binary content; assets are unchanged.
- Independent reviewer: Required 0 for module, integration and corrected tests. A narrow-width safe-area advisory was applied. The reviewer did not repeat tests, build or browser play.

## Final normal-input acceptance

The designated Codex supervisor completed one normal-input route on fixed commit `89f6d181352bdcae7b73eef731bf9aef9ece5e2c`, using the production build on 2026-11-22. Source, dependencies, HEAD and the running server were frozen throughout play. An initial preview base-path setup issue was corrected before gameplay began; it did not require a code change or a repeated route.

- Compact map stayed visible beside the shoulder view and followed position/facing. Clicking it, C and native Enter activation opened the fullscreen dialog. Close, native Space, C and Escape returned to the shoulder view and restored focus to the minimap button.
- Fullscreen map paused movement and camera orbit. E, Q and R had no gameplay effect while open. Opening during held movement stopped the player; closing left the same map position, stage, milk count and towel state without delayed actions or movement.
- Portrait 390 × 844 and landscape 844 × 390 viewport checks showed the compact map, fullscreen map, labels and close control without HUD overlap. The temporary viewport override was reset. These are browser viewport/click checks, not physical-device touch or notch tests.
- Both milk markers disappeared after collection. Both high-handle doors changed to their open map state after normal E interaction.
- Completed Duck → Child → Adult, two milk bottles, narrow child passage, opened gate, drying, dressing, reception, front door and street-only CLEAR. The map remained available on the clear screen. Browser error log: zero entries.

Private screenshots retain desktop/fullscreen, portrait compact/fullscreen, grown-player map and clear-screen evidence. No additional all-failure-condition route was repeated; existing automatic coverage and prior release evidence remain separate.

## Publication

Before the verification-record push, the concurrent contextual-help session had already merged this implementation into `555b386bfc204a458d08178f837f3ba005c665d0` and published it. That revision is preserved. Its [Pages workflow](https://github.com/shunkat/sento-duck-explorer/actions/runs/45015379028) passed build/deploy, 292 tests across 33 files, 21 Python tests and publication checks. Public `version.json` matched the same revision. The model tree is unchanged and the separate outdoor-bath WIP is excluded.

The integration reviewer reported Required 0: the map module and level are unchanged; the new settings gate blocks C only while settings are open, while map C-close, pause, held-input cleanup and layout remain intact. The supervisor performed a separate, limited production check on `555b386`: settings blocked C and movement; Escape then C opened the map; map pause, C-close, fresh movement, click-to-expand, Escape return and compact/fullscreen layout at 390 × 844 all worked. The viewport was restored and the production error log had zero entries. This was a merge-interaction check, not a second full route. The `89f6d18` route is not relabelled as an integrated-version run, and the broader help/signage checks in `docs/contextual-help-verification.md` remain separate.

This follow-up changes verification records only, under the existing main/Pages authorization and immediate pre-push publication, identity, remote-state and deadline checks. Its live revision and exact artifact comparison are checked after deployment. No new asset, paid service or Devpost submission is part of this release.
