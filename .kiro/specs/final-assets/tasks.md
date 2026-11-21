# Implementation Plan

Scope: final assets through the mandatory pipeline (reference image → Image to 3D → Blender adjustment → GLB → game integration). Placeholder primitives stay until each final asset passes its checks. Continue work covered by the user's existing authorization; task 3 identifies concrete operations that require new approval. Ordinary method selection and local preparation do not wait for approval.

Created on 2026-11-20 by the main Kiro agent writing the files directly. The spec sub-agent was not used, because it had failed earlier in this project; `.kiro/steering/project-autonomy.md` allows this.

Production status updated by Codex on 2026-11-20. Codex operates the image → Meshy → Blender pipeline; Kiro Crew implements the shoulder-view integration, and Kiro Web owns PR #3's ModelAdapter. `assets/ledger.csv` records individual files. Exported assets, integrated branch code, and normal-input gameplay are distinct completion states.

- [x] 1. Local preparation (no external services)
  - [x] 1.1 Write requirements, design, tasks, and progress for this spec
  - [x] 1.2 Create the asset ledger template `assets/ledger.csv`, the manifest `assets/manifest.json` with planned limits, and `assets/README.md`
    - _Requirements: 6.1, 6.2, 7.1_
  - [x] 1.3 Run `python3 scripts/check-publication.py` before and after
    - _Requirements: 11.3_

- [ ] 2. Preparation (initial method revised; ModelAdapter remains open)
  - [ ] 2.1 Design brief and silhouette guide sheet for Duck, the hat, and the bath section kit: true-scale front, side, and back outlines, socket marks, palette (local SVG or a Blender script). Ledger rows `reference / in_progress`; a guide is not the finished reference image
    - Superseded for the initial four characters/items by original three-quarter images, followed by measured Blender checks. Multi-view guide sheets were not produced.
    - _Requirements: 1.1, 3.2, 4.1, 4.2, 8.3_
  - [ ] 2.2 Survey the public terms, pricing, and documentation of Meshy and at least one alternative Image to 3D service. Answer the six questions in the design with links and dates; recommend one service with reasons
    - Meshy Free / Meshy 6 Lite was selected and authorized; the official terms, free download rules and training use are recorded in `assets/service-selection.md`. The original multi-service survey is not claimed complete.
    - _Requirements: 7.3_
  - [x] 2.3 Check OpenAI's reference-image output terms and record rights/provenance per asset
    - _Requirements: 7.1, 7.4_
  - [x] 2.4 Record the asset license policy: project reference-image rights under MIT; Meshy-generated and Blender-modified models under CC BY 4.0 with attribution and modification notices
    - _Requirements: 7.1, 7.5, 7.6_
  - [ ] 2.5 ModelAdapter (view layer only), tested with a locally made test GLB under `tests/fixtures/` (a fixture, never a final asset)
    - PR #3 merge integration connects ModelLibrary through the existing setCharacterModel/setItemModel paths. The Crew facing, outfits, held-item and per-carrier placement remain intact. Automated integration checks cover partial loads and invalid human contracts; no new browser run is claimed. Non-hat final item models remain open.
    - `src/view/models.ts`: GLB loading through the `three/addons` GLTFLoader, socket lookup, fallback to primitives on error
    - `GameScene`: use the model when it is loaded; root at `centerY − radius` (Duck) or `centerY − height / 2` (humans); facing from movement; hat, carry (Duck root on `socket_carry` at 0.90 m), and held-item parenting
    - Manifest bounds test (no WebGL); all existing tests unchanged; `npm run build`
    - _Requirements: 3.6, 4.3, 4.5, 9.1, 9.2, 9.4_

- [x] 3. Select provisional methods and check authorization for the initial assets
  - [x] 3.1 Adopt original OpenAI-generated three-quarter references; record prompts, revisions and rights
  - [x] 3.2 Select Meshy Free / Meshy 6 Lite; user explicitly authorized free registration, terms acceptance, original-image upload and generation. Four untextured raw GLBs downloaded. No new payment is authorized
  - [x] 3.3 Record MIT reference rights separately from Meshy CC BY 4.0 raw and modified models, including attribution and actual modifications
    - _Requirements: 7.2, 7.3, 7.6_

- [ ] 4. Duck (stage 2, first; after method selection and any required service authorization in task 3)
  - [x] 4.1 Original three-quarter reference → `assets/duck/ref/`; prompt, rights and ledger row (revised method; no multi-view sheet)
  - [x] 4.2 Image to 3D generation; keep the unmodified Meshy 6 Lite raw output and ledger row, CC BY 4.0
  - [x] 4.3 Blender: 0.30 m height, bottom-center origin, +Y up / +Z front, `socket_hat`, `socket_label`, 5,800 triangles, one material with vertex colors; saved `.blend`, reimported GLB and independent review
  - [ ] 4.4 Export `public/models/duck.glb`; record the checksum and measured bounds in the manifest; integrate through the ModelAdapter
    - Export/measurement and branch normal-input integration checks complete. PR #3 merge integration unifies the loader; its automated evidence is separate from the recorded normal-input checks.
    - _Requirements: 1.1, 3.2, 3.5, 4.1, 5.1, 6.1–6.3_

- [ ] 5. Hat (stage 2, second)
  - [x] 5.1 Reference → Meshy → Blender → `public/models/hat_sauna_duck.glb`; 0.1801 m base, 1,440 triangles, retained hollow underside; ledger, manifest, independent review and combined Duck/hat render complete
  - [x] 5.2 Check the hat on and off the Duck in the game (equip, carry, checkpoint restore); Codex normal-input verification on `a72b765`
    - _Requirements: 4.1, 4.2, 4.5_

- [ ] 6. Bath section kit (stage 2, third)
  - [ ] 6.1 Reference → generation → Blender kit: walls, NarrowHole wall (clear 0.40–0.45 m), door frame, tub, kakeyu, soap, coin. Derived pieces have inherited `reference` and `generated` rows pointing to the parent's real files (design: Derivation)
  - [ ] 6.2 Place the kit on the existing layout coordinates; collision still comes from `src/level/layout.ts`
  - [ ] 6.3 Readability checks in the DuckView and the Overview (hole rim, items, Duck on water)
    - _Requirements: 1.2–1.4, 2.2, 3.1, 5.2, 8.1–8.5_

- [ ] 7. Stage-2 verification and style record
  - [ ] 7.1 Measure the stage-2 triangles, draw calls, and download size; name the reference machine in the progress record
  - [x] 7.2 Browser playthrough for the current four-model set with F1–F7 and four restores; Codex operated normal inputs, overview-assisted; exact versions in `docs/shoulder-view-verification.md`. Recheck affected paths when the environment kit replaces primitives
  - [ ] 7.3 Write the style record in the design (palette, roughness, edge softness, texel density)
    - _Requirements: 2.3, 5.2–5.4, 9.3, 9.5_

- [ ] 8. Stage 3: humans and facilities in the recorded style
  - [ ] 8.1 Child and Adult with a shared skeleton, `clothed` and `bath` body variants (abstract toy-figure body, no towel on the body), `socket_hand_r`, and Adult's `socket_carry`
    - Original references, raw Meshy models, editable Blender scenes and exported v01 variants/sockets are complete; exact files and measurements are in the ledger and manifest. The initial GLBs are static meshes: a shared skeleton and walking/carry/wiping animations are not implemented or claimed complete.
  - [ ] 8.2 Towel (while its owner is in the bathwater, drawn on the head or on the tub edge, never in the water), key; reception, changing room, sauna and seated crowd (gaps kept at 0.60 m), open-air bath, pond
  - [ ] 8.3 Repeat the checks in tasks 2.5 and 7 for every replacement
    - _Requirements: 2.4, 3.3, 3.4, 4.3, 4.4, 9_

- [ ] 9. Costume Contest presentation (only if the user adopts the proposal)
  - [ ] 9.1 Pure `deriveCues(state, level)` and unit tests showing that cues never change outcomes
  - [ ] 9.2 Lanterns, steam spirit, pond light; "reduce effects" option
    - _Requirements: 10.1–10.4_

- [ ] 10. Release checks for assets (every commit of asset files is public)
  - [x] 10.1 Every current asset in `public/models/` has `redistributable = yes`, complete ledger rows, and a license that the recorded policy from 3.3 allows; third-party notices updated
  - [x] 10.2 Reviewed current four GLBs, Blender sources and ledger before asset commits; independent cross-review complete (scanner alone does not inspect binaries)
    - _Requirements: 6.3, 7.2, 7.5, 7.6, 11.3_

## Finishing batch, 2026-11-21 (Codex)

The user deferred normal-input play and requested finishing work, then reported malformed Duck eyes and asked for better model fidelity.

- [x] Original washing-station reference and provenance saved.
- [x] View-only environment replacement path, primitive fallback and automated placement tests for five stools/basins. Runtime URLs now register the two completed exports in the local finishing branch.
- [x] Washing-station Image to 3D → Blender → final exports: separate single-object Meshy 6 Lite / CC BY 4.0 / texture-off models were downloaded and corrected in Blender, as chosen by the user. After the user rejected v01 quality, v02 uses supported source-derived masters, curvature-aware reduction, fixed-condition comparisons and separate material critique. Stool: 4,610 triangles / 84,676 bytes; basin: 2,816 triangles / 52,320 bytes. Existing five-pair slots use uniform containment without changing LEVEL collision. No paid subscription or higher-model generation was purchased. See `assets/wash_station/README.md`.
- [x] Repeatable quality loop: archive prior exports; reimport actual GLBs; generate five directions × four diagnostic materials; reject visual regressions even when geometry checks pass. Preserve the research, rejected-candidate reasons, sampled errors and final comparison hashes.
- [x] Prevent basin stretching in placement; test proportions and openings; count actual all-visible scene geometry with every human outfit combination (59,576 triangles under the unchanged 60,000 limit).
- [x] Duck v02: local eye correction on the original generated body, export/reimport and multi-angle asset renders; bounds and sockets preserved.
- [x] Broader existing-model correction after additional user feedback: Duck v03 head/torso/wing/color refinement, hat v02 source-profile/loop retopology, and human v02 facial/shoulder/pose/clothing corrections. Preserve prior GLBs, raw sources, detailed masters and the exact socket contracts. Fixed comparisons and separate material QA accepted the selected revisions; this is not Crew B code review or user acceptance. See `assets/quality/existing-models/index.html`.
- [x] Verify current all-visible scene geometry (59,776 triangles), real exported human shoulders/hand proximity, static hat/carry fit and self-contained textures. Validate source-script reproducibility and remove embedded PNG metadata without changing geometry or retained image data. Final automated results are in the progress record.
- [x] Independent code/acceptance review of `ab085bf..9123a01`: no required findings. Codex covered the unavailable Crew B route; this is recorded as a Codex review, not Crew B execution. The existing 259-test result was reused; provenance and PNG lineage were independently checked.
- [x] Local rendering checks and release preparation: inspect actual GameScene lighting, outfits, static attachments, washing station and overview; fix opaque batching and temporary fade pass cost. See `docs/model-release-verification.md` for scope and measured results.
- [ ] Normal-input play and remaining route/layout/F8 checks: deferred at the user's request; static diagnostics do not complete these checks.

The body, beak and wings remain source-derived; the two eye inserts are explicit Blender corrections, not another Image-to-3D generation. See `assets/duck/blend/duck__v02.md` and `assets/wash_station/README.md`.
