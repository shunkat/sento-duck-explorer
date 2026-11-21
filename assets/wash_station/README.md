# Washing-station finishing batch

2026-11-21: Codex created the original transparent reference for an ivory bath stool and yellow open wash basin using built-in OpenAI image generation. The exact prompt and rights are in `ref/README.md`; the original PNG and its checksum are in the ledger. That paired reference is retained as provenance. Production now uses separate single-object references for the [stool](../bath_stool/ref/README.md) and [basin](../wash_basin/ref/README.md), with a separate Meshy generation for each asset.

**Current status:** separate single-object stool and basin references were generated with Meshy 6 Lite, texture off, under CC BY 4.0. Each generation cost 10 free credits. Both unmodified GLBs were downloaded: the stool preview reported 87,590 triangles / 43,795 vertices; the basin reported 97,848 triangles / 48,926 vertices. The stool image was manually uploaded by the user; Codex uploaded the basin image through the normal native file picker. Blender correction, GLB export and reimported measurements / multi-angle asset checks are complete for both assets. The local branch registers the exports for the five existing stool and five existing basin slots.

**Quality decision (2026-11-21):** after reviewing the higher-quality option and its subscription requirement, the user chose to remain on the free plan and correct the generated shapes in Blender. No higher-model generation or paid subscription was purchased. The working model selector was restored to Meshy 6 Lite. Inspect the corrected exports against their references and preserve the original meshes; a low triangle count does not excuse distorted shapes.

The earlier automatic upload tool returned an error referring to a ChatGPT extension and file-URL permission. The extension's actual name or presence and that diagnosis were not verified; the user reported no such extension. The user's manual stool upload and Codex's native-file-picker basin upload both succeeded, so the tool error is not a confirmed permission blocker for this production workflow.

The renderer can replace the five stools and five basins through `EnvironmentModels`, preserving existing LEVEL envelopes and primitive fallback. Both runtime URLs are registered after the production and rights checks. The remaining bath-section kit is unfinished. The fixture boxes used in automated tests are test-only, not artwork.

## Finished assets and remaining verification

| Asset | Blender correction | Final export |
| --- | --- | --- |
| [Ivory stool](../bath_stool/README.md) | Removed seat rings; regularized four generated legs; retained drain and underside; smoothed feet | 3,000 triangles, 55,568 bytes; 0.36 × 0.30 × 0.36 m |
| [Yellow basin](../wash_basin/README.md) | Retopologized measured generated cross-sections; removed angular waviness; preserved rolled rim, cavity and solid floor | 1,920 triangles, 36,176 bytes; 0.20 × 0.14 × 0.18 m |

Both have one material, no texture, finite geometry, no nonmanifold edges, bottom-center origins and +Y up. Their original generated meshes and editable Blender sources are retained. The 1,200/800-triangle drafts were rejected for contour damage; final budgets are 3,000/2,000. Five pairs draw 24,600 triangles and use ten shared-resource instances. The exports total 91,744 bytes.

These are asset production and automated integration results. Independent review and the user's deferred in-game checks remain pending: Duck-height silhouette, stool feet/drain, basin interior under game lighting, labels, and washing-station passage. Do not restart a full playthrough for this individual change.

Meshy source references: [terms](https://www.meshy.ai/terms-of-use), [Free plan](https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan). The reference's MIT distribution does not license Meshy outputs; those must retain their own applicable attribution and license.
