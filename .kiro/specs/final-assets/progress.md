# Progress and Verification Record

Last updated: 2026-11-21.

## Current summary

Four character/item models are integrated in the existing baseline. The local finishing branch additionally contains Duck eye refinement and two produced washing-station models registered for the five existing pairs. See the asset ledger and finishing entry below. Independent review and the deferred game-view checks remain pending for this batch; the rest of the environment, props, animation and presentation remain unfinished.

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

## Finishing batch, 2026-11-21 (Codex, local branch)

Base: `ab085bf`, branch `assets/wash-station-finish`. The user deferred real play and requested finishing, then reported poor Duck eye fidelity. Codex produced this batch; it is not Kiro implementation or independent-review evidence. Existing frozen worktrees, servers and game browsers were not changed.

- **Duck v02**: retained the original generated body, smoothed only the old eye patches, replaced irregular dark coloring with two matched smooth eye inserts. Export: 7,720 triangles, 3,866 vertices, one material, no texture, 187,588 bytes. Budget provisionally raised to 8,000 triangles to retain eye contour quality without further body decimation. The v01 GLB is archived beside its original Blender source.
- Reimported final candidate in Blender; exact body bounds and hat/label sockets match v01, all geometry is finite, and nonmanifold-edge count is zero. Inspected front, both three-quarter views, eye close-up and hat fit. Scoped binary-metadata scan found no private path/mail/token-prefix matches. Shape renders are saved under `assets/duck/blend/`; these are asset checks only.
- **Washing station**: paired reference retained as provenance; two separate single-object references produced. Both Meshy 6 Lite / texture-off / CC BY 4.0 generations completed and were downloaded, at 10 free credits each. Preview counts: stool 87,590 triangles / 43,795 vertices; basin 97,848 triangles / 48,926 vertices. The user's manual stool upload and Codex's native-file-picker basin upload succeeded; the earlier automatic-upload error did not establish the named extension's presence or the cause of failure.
- **Quality decision**: the user chose to remain on the free plan and correct the generated shapes in Blender. No paid subscription or higher-model generation was purchased. The two generated models have now been corrected and exported: stool 3,000 triangles / 55,568 bytes, basin 1,920 triangles / 36,176 bytes. Reimported multi-angle checks verify four stool legs, an open drain, the hollow basin and a solid floor. Both have one material, no textures and zero nonmanifold edges. Detailed measurements and source-to-export hashes are in their asset directories and ledger.
- The environment replacement path is ready for five stools and five basins, fitting the existing LEVEL envelopes with shared resources and primitive fallback. Both runtime URLs are now registered after the multi-view shape checks. Five pairs total 24,600 drawn triangles; the two files total 91,744 bytes. These are asset counts, not measured whole-scene draw calls or frame rate.

Earlier verification for the Duck/replacement-code commit `b4af198` (before the two washing-station exports): `npm test` **254 passed / 19 files**; `npm run build` passed with the existing large-chunk warning; source/index publication scan **PASS, 290 inspected, 0 findings** and dist scan **PASS, 13 inspected, 0 findings**. A CSV newline-only whitespace issue found by `git diff --check` was corrected afterward; no game source or model changed after those tests. Ledger checksums and local links are checked separately before the local commit.

Final washing-station verification, 2026-11-21, Codex, working tree based on `b4af198`: `npm test` **258 passed / 19 files**; `npm run build` passed with the existing large-chunk warning. Four added real-GLB checks cover production hashes/budgets/bounds, the basin's interior/floor/walls, and the stool's drain/clearance. Existing environment placement/fallback tests also pass. Source/index publication scan: **PASS, 343 inspected, 0 findings** before staging and **PASS, 382 inspected, 0 findings** including the staged files; dist: **PASS, 17 inspected, 0 findings**. All 27 completed ledger checksums match; both exported models, their license files and the shared attribution notice are present in dist. Per-asset binary metadata checks found no scoped private markers. No source or asset changed after these tests; final updates only record these results.

**Remaining:** independent review and the user's deferred in-game visual checks for this finishing batch. The remaining bath-section kit, other props and character animation are still unfinished. No normal-input playthrough, new deployment, merge, push or Devpost submission was performed by this batch. Automatic checks and asset renders do not constitute user acceptance.

## Quality-loop revision after v01 rejection (2026-11-21, Codex)

The user reported that Blender adjustments still had poor quality and requested established methods for improving fidelity. Work continued on the isolated finishing branch based on `e68ec15`; the v01 acceptance language above is historical, not the user's approval. No paid service or new generation was used.

Research considered supported subdivision/control topology, high-detail masters with separate runtime meshes, curvature-aware reduction, normal transfer and fixed-condition render comparison. Sources, evidence limitations and the applied decisions are in `reports/Blender 素材品質 改善実験.md`. The repeatable procedure is now part of the design. The new comparison script reimports exported GLBs and records hashes, cameras, lighting and five directions × four materials. Separate material QA rejected intermediate versions even when topology/count checks passed; this is asset QA, not Crew B code review.

- **Stool v02:** 4,610 triangles / 84,676 bytes; SHA-256 `1df13475185623882db1d63d99cc52f9ebff03cc40d62fb5136672a4f7515e55`. Source-sampled control sections, support loops, preserved feature edges and clean-master normals remove the earlier broad triangular seat shading and improve slot/foot contours. A fixed-lighting review exposed a remaining side-arch crease in the detailed master. Correcting the correspondence initially changed the feet, so the final correction is restricted to the side-arch shoulder with a smooth height transition. Raw data, four feet and the open drain remain verified.
- **Basin v02:** 2,816 triangles / 52,320 bytes; SHA-256 `29196b8bc4b62edec5f81a4831b183472f34f86cc2477ae1cd7653386be80111`. Uniform source scaling restores the round footprint and natural 0.452 height/diameter ratio; the old envelope had stretched it about 1.55× vertically. A detailed profile master and adaptive sample allocation preserve the rim and floor. A shape-error-only optimization introduced a shading band and was rejected. A separate material A/B selected a brighter yellow while retaining identical geometry and normal bytes.
- Runtime containment uses one scale for all axes; LEVEL collision, routes and slot coordinates are unchanged. Five pairs total 37,130 triangles and 136,996 downloaded bytes. The actual all-visible scene graph contains 59,576 triangles across every human-outfit combination, within the unchanged 60,000 limit. This is an offline geometry count, not measured GPU draw calls or FPS. The provisional kit allocation is now 37,500; later facilities need allocation/LOD work.
- [Final comparison](../../../assets/wash_station/quality/v02/index.html): 80 fixed-condition old/new images. The material reviewer directly inspected all five beauty views and representative clay/reflection/silhouette views (20 final images), checked runtime/comparison hashes, and found no major new defect. Small close-up polygonal contours and reflection-plane boundaries remain. Exact reference-image reconstruction and user acceptance are not claimed.

Validation on the selected runtime files: **259 tests / 20 files passed**; production build passed with the existing >500 kB chunk warning. The build was refreshed after final attribution text changed; GLBs and individual license files match dist byte for byte. All 31 completed ledger hashes match. Source/index preflight passed with 613 inspected / 0 findings before staging and 842 inspected / 0 findings including the staged files; dist passed with 17 inspected / 0 findings. The final PNG metadata check found and removed remaining EXIF chunks from diagnostic renders, verified unchanged image-data streams, and confirmed all 172 quality PNGs have no text/EXIF chunks. Both asset producers separately audited the Blend/GLB sources, raw preservation and external references. These are scoped checks, not an exhaustive security guarantee.

Crew B's code review, actual game-lighting/label checks, GPU measurements and the user's deferred final play remain pending. No game browser, frozen play worktree or server was operated, and no push, merge, deployment or submission was performed.

## Existing-character quality revision (2026-11-21, Codex)

The user reported that the existing models also had poor quality. Work continued on the isolated finishing branch from `2dd8148`, preserving the raw/reference files, all earlier Blender scenes and the prior runtime GLBs. No new generation, paid service, network-setting change or normal-input play was used.

The main defects were not solved by increasing polygon counts alone. Human facial/garment colors were evaluated too coarsely, the old shoulder/arm deformation made angular surfaces, and one new reduction trial mistakenly prioritized collapsing the head. That trial left only 350 triangles above Child Z=0.72h and was rejected. New source-based pose corrections exclude the head and legs; a small, verified reduction-weight influence preserves useful contours. Continuous facial/clothing fields are baked after reprojection from the detailed source. Fixed comparisons then exposed two remaining color errors: a Child fringe mask about 3 cm too high and Adult shorts masks 14–22 mm above their actual hems. Source cross-sections were measured and both masks corrected without changing geometry.

Duck v03 uses a source-measured head fit, local torso fairing, a clean body-color bake and glossy paired eyes. Fairing first removed too much of the wing's front outline, so that candidate was rejected and the whole rounded wing boundary protected. Hat v02 uses measured inner/outer sections and a fitted source-loop contour, preserving the hollow interior and restoring the source's natural height. Small felt-normal trials had little visible benefit and increased file size, so the matte version was retained.

| Selected runtime | Visible triangles | GLB bytes | Materials / embedded textures | SHA-256 prefix |
| --- | ---: | ---: | --- | --- |
| Duck v03 | 7,296 | 350,388 | 2 / 1 | `75ca48aec7a8` |
| Hat v02 | 2,064 | 38,676 | 1 / 0 | `e6362a9bdffa` |
| Child v02 | 5,600 per outfit | 724,184 | 2 / 2 in file | `e69c7427abf6` |
| Adult v02 | 5,800 per outfit | 739,012 | 2 / 2 in file | `61ce44be0c75` |

The four files total 1,852,260 bytes. Only one human outfit is drawn at a time. The actual all-visible GameScene contains **59,776 triangles** for all four clothing combinations, within the unchanged 60,000 limit. The Duck/hat pair costs 200 more triangles than before; the human visible total remains 11,400. This count is not a GPU timing or draw-call measurement.

[Comparison entry](../../../assets/quality/existing-models/index.html): 160 fixed-condition old/new images, plus seven static attachment views. Original exported geometry stays at authored metric scale. The material reviewer directly inspected the relevant face, body, silhouette, clothing and opposite-side images, rejected flawed intermediates and accepted the selected shapes/colors. Exact inspected files, hashes, rejected versions and remaining limits are in [the review](../../../assets/quality/existing-models/review.md). This is separate asset QA, not Crew B's code review or the user's visual acceptance.

The integration inspection uses the actual GLBs: the hat keeps the eyes/beak visible and leaves 24.840 mm below Duck's bottom-anchored label; Adult's static hand/carry pose is aligned with the Duck. Human shoulder widths stay within the existing bands, and nearest hand-surface vertices are about 3.30 mm (Child) and 8.02 mm (Adult) from their unchanged hand sockets. Original raw vertex/face data, finite geometry, UV-seam-welded topology and packed textures were checked. Private clean reruns of the human producer script reproduce the selected geometry and texture payloads exactly; naming differences in JSON are not claimed to be whole-file determinism.

Final hygiene found EXIF chunks in the four embedded Human PNGs. `scripts/sanitize-glb-png.py` removes those ancillary chunks while preserving every other PNG chunk and non-image buffer view, materials and transforms. The comparison JSON retains the hashes actually rendered, records the runtime hashes separately and links the byte-equivalence proof. The sanitized public GLBs were reimported and attachment images regenerated. The sanitizer is now part of the human export script, with a prohibited-chunk assertion.

Validation of the selected public GLBs: **259 tests / 20 files passed**, and the production build passed with the existing large-chunk warning. The scene-budget test was repeated alone with console output enabled to record the 59,776 count; the full suite was not repeated. New real-asset checks protect actual human shoulders/height/hand proximity, texture containment and file/material/triangle limits, while removing obsolete requirements to retain the old eye tessellation and body extrema. All 39 completed ledger hashes match. A scoped audit of four decompressed Blender scenes, four final GLBs and 347 quality PNGs found no tested private markers or remaining text/EXIF chunks in the inspected PNGs. Source preflight passed with 1,249 inspected / 0 findings before the comparison index was added; the final staged result is recorded below. Dist passed with 17 inspected / 0 findings, and all model/license files plus the shared notices match the source byte for byte. Local artifact links were checked.

Remaining limits are light faceting in close facial/hair silhouettes, small bake softness, simplified hands/feet and a matte approximation of felt. Crew B code review, actual game lighting/labels, GPU measurements and the user's deferred full-batch play remain pending. Main and other verification worktrees/servers were not changed. No push, merge, deployment or submission was performed.

Final staged publication scan: **PASS, 1,658 inspected, 0 findings**; staged whitespace check passed. The earlier scanner findings were false positives in `matrix @ vector` expressions and literal audit-marker strings; source formatting was clarified without weakening the scanner or changing the marker bytes. There are no files over 50 MB in this change. The shared comparison/record links were checked (488 local links at that check), and main remained clean at `ab085bf`.
