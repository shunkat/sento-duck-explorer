# Model refinement release checks

2026-11-21. Codex prepared the source-derived model refinements and release checks. Kiro remains the primary game implementer. The user authorized publishing the improved models; normal-input play remains deferred. This is a development-demo release, not completion of the entire final-assets spec or a competition submission.

## Reviewed model batch

The model and integration baseline is `9123a0194050434a55c54b669c5b34285c74d8c5`, compared with the previous public `ab085bf`. The six runtime models total 1,989,256 bytes:

- Duck v03: corrected eyes, head, body surface, wing outline and color.
- Hat v02: source-derived profile, hollow underside and restored natural proportions.
- Child and Adult v02: repaired faces, shoulders, arm shaping and clothing boundaries; both static outfit variants retained.
- Stool and basin v02: preserved openings, rounded surfaces and source proportions; runtime placement uses uniform scale.

The [fixed-condition material review](../assets/quality/existing-models/review.md) and [washing-station comparison](../assets/wash_station/quality/v02/index.html) record the selected and rejected candidates. All source images, actual Meshy outputs, Blender sources, GLBs and redistribution terms are traced by the manifest and ledger. The new models do not add skeletons or movement animations.

A separate Codex reviewer covered the temporarily unavailable Crew B route and found no required code changes in `ab085bf..9123a01`. This is not reported as a Crew B execution. The reviewer checked the view integration, fallback, dimensions, sockets, 39 completed SHA-bearing ledger rows, six pipeline records, PNG metadata and rendered-to-distributed hash lineage. The requirements now match the recorded pale-aqua hat palette.

## Verification and limits

- Reused the 259 passing tests from the model baseline rather than repeating the same suite for each model. Geometry tests retain actual GLB geometry and transforms; only image decoding is stubbed.
- Rebuilt with the GitHub Pages base path; build and five deployment-window tests passed. The existing JavaScript chunk-size warning remains.
- The six GLBs, model licenses, notices and code license matched the local distribution byte for byte. Distribution publication scan: 17 inspected, zero findings.
- Independently audited all four unpublished commits, including text blobs no longer present in the final tree; no publication blocker found. Binary inspection was scoped to known metadata/private-marker patterns, not a guarantee against every possible encoding.
- Opened the actual game and the Pages-base build in Chrome. The initial scene, model textures and overview rendered without captured warning/error logs. Used the normal C key only to inspect the map; this is not a clear-route playthrough.
- Inspected state-injected diagnostic scenes through the real GameScene, ModelLibrary, deriveView and FollowCamera: washing station, both human outfits, Duck with hat on water and Adult carrying Duck. The diagnostic does not simulate item acquisition, checkpoint restoration or route completion.
- At 1280 × 720 and DPR 1 on Apple M4 / macOS 15.7.7, five-second rAF observations were about 60 FPS. This measures displayed frame intervals, not GPU execution time. The pre-optimization overview used 168 draw calls, exceeding the 120 target; this finding required a rendering follow-up before release.

Remaining work includes final environment/small-item models, human animation, and the designated supervisor's single final normal-input route with the outstanding layout/F8 checks. Static rendering and successful deployment do not complete those checks.

## Rendering follow-up

The final follow-up batches only explicitly owned opaque, fixed surfaces with identical materials. The full-height walls retain the same low-wall overview transform. Transparent surfaces, replacement slots, roofs, labels, characters, items and independently moving objects remain separate. No surface is removed or simplified. Tests compare oriented triangles, world positions, normals, UVs and materials through normal → overview → normal, and confirm a reduction of 59 meshes.

The next visual check exposed a separate existing cost: a faded DoubleSide human was rendered twice. The temporary obstruction fade now uses one pass and restores the original material setting on return to opacity 1. The GLBs, original double-sided setting and opaque appearance are unchanged. The actual-GLB budget test now includes the renderer's extra-pass condition across both outfits and opaque/fade/restored phases: all 12 combinations remain at 59,776 submitted triangles.

The batching follow-up passed the full 261-test suite and typecheck. The subsequent fade fix passed its eight targeted tests and typecheck; the unchanged full-suite evidence was reused locally. Both changes received separate, scoped review by the same independent reviewer, with no required findings. The final Pages build passed with the existing chunk-size warning.

Measured after the fixes, using the same diagnostic positions and 1280 × 720 / DPR 1:

| View | Before | After | Observed frame intervals |
| --- | --- | --- | --- |
| Adult carry, overview | 168 calls / 59,506 triangles | 109 calls / 59,506 triangles | 60.0 FPS, mean 16.67 ms, p95 18.50 ms over 5 s |
| Held-hat side view, foreground Adult faded | 87 calls / 62,090 triangles after batching | 86 calls / 56,290 triangles after fade fix | 60.0 FPS, mean 16.67 ms, p95 18.60 ms over 5 s |

The washing-station silhouette, wall cutaway and restored full walls remained intact. The foreground-body fade still exposes the controlled Child; its sorting tradeoff is limited to this temporary translucent display. Shared batches can submit some off-screen geometry, so the maximum all-visible budget remains the conservative bound. These are local static diagnostic measurements, not a claim about every device or a normal-input performance run.

## Public release verification

The release process checks the successful Pages workflow, public version.json and every published distribution file against the workflow artifact. The exact deployed revision and run are available from [version.json](https://shunkat.github.io/sento-duck-explorer/version.json) and [Pages workflow runs](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml).

The [official rules](https://kiroween.devpost.com/rules) and [schedule](https://kiroween.devpost.com/details/dates) were rechecked on this date; the recorded submission deadline remains December 4, 2026, 14:00 PST. Existing earlier deployment cutoff checks remain enabled. No paid service or submission action was taken.

## Footless Duck follow-up

The user's subsequent request replaces only Duck v03 with the footless v04 derived from the same source. The other five runtime GLBs and game implementation remain unchanged from released `02bb877`. The [v04 edit and audit](../assets/duck/blend/duck__v04.md) records the archived v03, rejected pedestal-shaped candidates, continuous rounded lower body, exact preserved upper positions/UVs, identical texture/eyes/sockets and separate review with no required findings.

The selected GLB is `43d385d81d6f2e1f520972db33426ddaf64b33250ca89b9f50d33a14fa17b779`, 337,204 bytes and 7,214 triangles. The six-model total is now 1,976,072 bytes. Thirty targeted tests across three files passed; they include the new underside regression, attachment/metric contracts and all outfit/fade scene-budget configurations. The regression was first observed failing on v03. The production build with the Pages base passed; the existing large-chunk warning remains. The standard Pages CI runs the complete suite before deployment.

The real GameScene diagnostic was inspected with v04 on water wearing the hat, and from the side while carried by Adult. No new shape/attachment defect or captured warning/error log was found. These were static state-injected views on an isolated server. The deferred normal-input route remains unperformed. Forty-one SHA-bearing completed ledger entries match, and the v04 binary/PNG metadata audit is recorded alongside the source. No paid generation, service subscription or network setting was changed for this correction.
