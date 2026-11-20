# Progress and Verification Record

Last updated: 2026-11-20.

## Current summary

Four real models are produced and integrated; see the asset ledger and the merge-integration entry at the end of this record. Animation, final environment/remaining props and presentation are unfinished.

## Initial Spec snapshot (historical)

- **Spec**: requirements, design, and tasks written and revised after an independent review. Task 1 (local preparation) is done.
- **Real production: not started.** No reference image, no Image to 3D generation, no Blender file, and no GLB exists.
- **Image to 3D service: not selected.** Meshy is a candidate. No account, contract, payment, upload, or generation has been made. The public-terms survey (task 2.2) can proceed without an account and has not started.
- **Reference image method: provisional plan only.** The plan is a guide sheet, then painting over it (design). The user has not chosen a method.
- **Repository and code license:** public GitHub repository under MIT (`LICENSE`), with `origin/main`. Codex reports that an hourly Kiro Web task is active. Kiro did not verify the remote or the schedule itself.
- **Asset rights: unchecked**, because no assets exist. The repository's MIT license does not settle them (requirements 7.6).
- **Costume Contest presentation**: organised as a proposal in the design. Not adopted by the user and not implemented.
- **Reference machine for performance**: not chosen.

## What Kiro did (2026-11-20)

- Read `KIRO_HANDOFF.md`, both steering files, `docs/kiroween-review.md`, `docs/periodic-development.md`, `scripts/check-publication.py`, and the prototype progress record.
- Wrote `requirements.md`, `design.md`, `tasks.md`, and this file directly as the main agent. The spec sub-agent was not used, because it had failed earlier in this project, and the steering allows this fallback. Spec format validation was not available, so these files were not machine-validated.
- Created the templates `assets/ledger.csv`, `assets/manifest.json`, and `assets/README.md`.
- Revised the spec after the independent review:
  - updated the repository and license status, keeping asset rights separate from the code's MIT license;
  - split the decision status into user-confirmed game content, the accompaniment idea the user chose to consider, and provisional designs from steering;
  - made the pipeline impossible to skip with "not applicable", and required derived assets to trace to the parent's real files;
  - replaced the towel-wrap bath outfit with an abstract body and steam, with the towel kept out of the water (F1);
  - split tasks into work that proceeds now and operations that need approval;
  - fixed the root-Y formulas (pond root −0.05 m) and defined the carry socket as Duck's root at 0.90 m (center 1.05 m).
- No game code changed. No tests were added. No commit or push was made; Codex reviews and publishes.

## Commands run by Kiro and their actual output

| When | Command | Output |
| --- | --- | --- |
| Before the first draft | `python3 scripts/check-publication.py` | PASS, mode `working_files_only_no_git`, 56 inspected, 0 findings |
| After the first draft | `python3 scripts/check-publication.py` | PASS, mode `working_files_and_git_index`, 122 inspected, 0 findings (a Git repository had been set up in the meantime) |
| After the review fixes | `python3 scripts/check-publication.py` | PASS, mode `working_files_and_git_index`, 122 inspected, 0 findings |
| After the review fixes | JSON parse of `assets/manifest.json`; CSV parse of `assets/ledger.csv` | manifest valid; ledger 14 rows, all 19 columns |

The scanner is a heuristic. It does not inspect history, the remote, binary metadata, or asset rights.

## What Codex verified

- For this spec: the independent review findings above, and the earlier measurement of the publication scanner (122 inspected, PASS) and the CSV (14 rows × 19 columns). The final independent re-review passed with no remaining required changes. Codex is responsible for publishing the reviewed files.
- Codex's earlier publication review and Chrome check are recorded in `.kiro/specs/prototype-core-gameplay/progress.md`.
- After the second independent review, Codex removed the remaining blanket approval gates for reference-image methods and asset-license policy, aligned the task and design wording with existing authorization, and reordered Requirement 9 without changing its criterion numbers or content. Kiro remains the author of the spec and templates; these final editorial corrections are Codex's work.
- Before publication, Codex staged the eight new spec/template files and the two operational-document updates, then ran the publication scanner against the working files and Git index: PASS, 130 inspected, 0 findings. Both JSON files parsed, the CSV remained 14 rows × 19 columns, and the staged whitespace check passed. Game code was unchanged; tests and build were not rerun for these documentation/template edits.

## What the user decided

- Earlier, in `KIRO_HANDOFF.md`: the mandatory pipeline and the production order. Nothing new for this spec. The project's MIT license and the public repository were set up on the Codex side; Kiro did not see the user's decision record for them.

## ModelAdapter (task 2.5), partial

- Added `src/view/models.ts` (`ModelLibrary` with `load`, `parse`, `get`, socket lookup, `measureModel`, `checkBounds`) and `GameScene.useModels(lib)` in `src/view/scene.ts`. A model replaces the primitive only when one is loaded; nothing calls `useModels` yet, so the game is unchanged. A load or parse error logs a warning and leaves the primitive.
- Wired in `GameScene`: model root at `centerY - radius` (Duck) or `centerY - height / 2` (humans), facing from movement, label at `socket_label`, hat at Duck's `socket_hat` while attached, carried Duck root at Adult's `socket_carry`.
- Not wired: hat, coin, and key at `socket_hand_r` while held (the view model has no holder field), `clothed`/`bath` body variants, and models for items other than the hat. Task 2.5 stays unchecked until these are done.
- Test fixture `tests/fixtures/test_box_duck.glb` (a 0.30 m box with the four socket nodes), generated by `scripts/make-test-glb.mjs` with Node only. It is a fixture, not a final asset, and has no ledger row.
- `tests/models.test.ts` (no WebGL): parse the fixture, socket lookup, fallback on errors, manifest bounds helper, real GLB parse checks, and hat socket pose tests. See the PR #3 sync section for the manifest checks.
- Not verified: rendering of a model in a browser. The scene integration is checked only by `tsc` and the build, with no WebGL test.

## Remaining real production

1. Proceed now: the guide sheets (2.1), the service and image-generator terms surveys (2.2, 2.3), the asset license policy proposal (2.4), and the ModelAdapter with a test fixture (2.5).
2. Adopt and record reasonable provisional image methods and asset-license policy. Ask only before concrete operations outside existing authorization, such as a new account or connection, terms acceptance, payment, permissions, unapproved external upload, or a release license outside the agreed scope (task 3).
3. Stage 2: Duck → hat → bath section kit through the full pipeline, then measurements, a browser playthrough, and the style record.
4. Stage 3: Child, Adult, items, and facilities in the recorded style.
5. The Costume Contest presentation, only if the user adopts it.

## Hat socket rotation fix (PR #3)

- `GameScene.placeHat` copied only the `socket_hat` world position, so the hat did not turn with Duck. It now uses `copySocketPose` (`src/view/models.ts`), which also copies the socket world quaternion. A detached hat has its quaternion reset to identity.
- Added regression tests in `tests/models.test.ts` (fixed angles and a fast-check property over yaw). Not verified in a browser.

## PR #3 sync with main

- PR #3 is merged with main (merge be4ee44). The placeHat rotation fix (ece9856, `copySocketPose` with its tests) is kept unchanged.
- `tests/models.test.ts` no longer expects an empty manifest: it checks measured entries (duck, hat_sauna_duck, child, adult) against their limits, and checks that `public/models/duck.glb` and `hat_sauna_duck.glb` parse with heights matching the manifest.
- Not done: connecting the real GLBs to the game (`useModels` is still not called) and browser verification.
- Review follow-up: the `placeHat` decision moved into `placeHatOnSocket` (`src/view/models.ts`) with tests for the attached and detached cases. The manifest test no longer requires specific assets to be measured. Hat, carried Duck and label placement are still not verified in a browser.

## Merge integration with the reviewed shoulder-view game (2026-11-20)

The initial status and PR #3 standalone notes above are historical snapshots. Four real assets and the normal-input route are already recorded in the asset ledger and `docs/shoulder-view-verification.md`. Codex resolved the overlapping scene implementations after the user requested PR merges: ModelLibrary now loads the runtime assets, while useModels delegates to the Crew model setters, preserving outfits, facing and carrier/socket placement. This supersedes the earlier statement that useModels is uncalled. No gameplay-core or asset changes were made.

Validation: 194 tests passed, including two new renderer-free tests for partial loading, invalid-human fallback, idempotent attachment and initial outfit selection. Production build and publication checks are recorded with the integration commit. Existing independent reviews and version-specific browser evidence are retained; this merge work did not repeat the playthrough. Non-hat final props, environment assets and animation remain unfinished.
