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

Pending on a fixed commit after all implementation and Required findings are complete. The designated Codex supervisor owns the only browser verification slot: compact/fullscreen map, click/C/Escape/native activation, focus, pause/resume, stale-input prevention, portrait/landscape layout, milk/door updates and one growth-to-street route. Native browser behaviour is not established by fake-DOM tests.

## Publication

Not yet published. Existing main/Pages authorization and the repository deadline checks apply. The final production revision and artifact comparison will be recorded after acceptance and deployment.
