# Washing-station finishing batch

2026-11-21: Codex created the original transparent reference for an ivory bath stool and yellow open wash basin using built-in OpenAI image generation. The exact prompt and rights are in `ref/README.md`; the original PNG and its checksum are in the ledger. That paired reference is retained as provenance. Production now uses separate single-object references for the [stool](../bath_stool/ref/README.md) and [basin](../wash_basin/ref/README.md), with a separate Meshy generation for each asset.

**Current status:** separate single-object stool and basin references were generated with Meshy 6 Lite, texture off, under CC BY 4.0. Each generation cost 10 free credits. Both unmodified GLBs were downloaded: the stool preview reported 87,590 triangles / 43,795 vertices; the basin reported 97,848 triangles / 48,926 vertices. The stool image was manually uploaded by the user; Codex uploaded the basin image through the normal native file picker. Blender correction, GLB export and reimported measurements / multi-angle asset checks are complete for both assets. The local branch registers the exports for the five existing stool and five existing basin slots.

**Quality decision (2026-11-21):** after reviewing the higher-quality option and its subscription requirement, the user chose to remain on the free plan and correct the generated shapes in Blender. No higher-model generation or paid subscription was purchased. The working model selector was restored to Meshy 6 Lite. Inspect the corrected exports against their references and preserve the original meshes; a low triangle count does not excuse distorted shapes.

The earlier automatic upload tool returned an error referring to a ChatGPT extension and file-URL permission. The extension's actual name or presence and that diagnosis were not verified; the user reported no such extension. The user's manual stool upload and Codex's native-file-picker basin upload both succeeded, so the tool error is not a confirmed permission blocker for this production workflow.

The renderer can replace the five stools and five basins through `EnvironmentModels`, preserving existing LEVEL envelopes and primitive fallback. Both runtime URLs are registered after the production and rights checks. The remaining bath-section kit is unfinished. The fixture boxes used in automated tests are test-only, not artwork.

## v02 correction after visual-quality feedback

The user rejected the v01 Blender quality. The new workflow keeps a detailed editable master and a separate game export, places support loops around important contours, reduces flatter regions first, reimports the GLB and compares it under fixed conditions. A separate material critique rejected intermediate versions with arch pinching, pointed feet, triangular seat shading or a dark basin material. Geometry checks alone did not approve those versions.

[Open the before/after comparison](quality/v02/index.html). Each asset also has five views in beauty, clay, silhouette and grazing-reflection materials. The actual export hashes and camera/lighting conditions are recorded beside the images. Diagnostic reflection materials expose defects; they are not the intended final plastic.

| Asset | Blender correction | Final export |
| --- | --- | --- |
| [Ivory stool](../bath_stool/README.md) | Source-derived quad surface; supported slot/feet; corrected side-arch correspondence locally; protected feature loops and detailed-master normals | 4,610 triangles, 84,676 bytes; 0.36 × 0.30 × 0.36 m |
| [Yellow basin](../wash_basin/README.md) | Preserved natural circular proportions; adaptive rim/profile sampling; detailed-master normals; brighter yellow tested separately with identical geometry | 2,816 triangles, 52,320 bytes; 0.20 × 0.090517 × 0.20 m |

Both have one material, no texture, finite geometry, no nonmanifold edges, bottom-center origins and +Y up. Original generated meshes, v01 exports and editable masters are retained. Five pairs contain **37,130 triangles** across ten shared-resource instances; the two exports total **136,996 bytes**. The offline test constructs the actual scene and counts **59,576 visible triangles** without frustum culling in each outfit combination. The 60,000 scene limit is unchanged. This is a geometry bound, not a GPU draw-call or frame-rate measurement. The partial bath-kit allocation is now 37,500; further facilities need allocation or LOD work.

Placement uses a single uniform scale within each existing LEVEL envelope. The basin therefore appears at 0.18 m diameter and about 0.0815 m height inside its old 0.20 × 0.18 × 0.14 m envelope. The previous independent-axis scaling made it oval and unnecessarily tall. Colliders, routes and placement coordinates are unchanged.

The final low-poly contours retain slight polygonal edges under close inspection. A single reference does not determine hidden surfaces or exact material response; reference and diagnostic lighting differ. The comparisons document specific improvements, not a numerical fidelity percentage or user acceptance. See [the research and experiment record](../../reports/Blender%20素材品質%20改善実験.md).

These are asset production and automated integration results. Independent review and the user's deferred in-game checks remain pending: Duck-height silhouette, stool feet/drain, basin interior under game lighting, labels, and washing-station passage. Do not restart a full playthrough for this individual change.

Meshy source references: [terms](https://www.meshy.ai/terms-of-use), [Free plan](https://help.meshy.ai/en/articles/15696428-what-is-included-on-the-free-plan). The reference's MIT distribution does not license Meshy outputs; those must retain their own applicable attribution and license.
