# Duck sauna hat model

Created on 2026-11-20 through the required **image → Image to 3D → Blender adjustment → GLB** pipeline. This is an exported game asset; browser integration, hat transfer, and gameplay verification are separate tasks.

| Stage | File | State |
| --- | --- | --- |
| Original reference | `ref/hat_sauna_duck__ref_threequarter_v01.png` | AI-generated image; see `ref/README.md` |
| Image to 3D | `gen/hat_sauna_duck__meshy6lite_raw_v01.glb` | Unmodified Meshy 6 Lite download |
| Blender adjustment | `blend/hat_sauna_duck__v01.blend` | Editable adjusted generated mesh |
| Game export | `../../public/models/hat_sauna_duck.glb` | Reimported and measured GLB |

Codex operated Meshy Free with Texture off and CC BY 4.0 displayed in the UI. Generation was submitted around 14:37–14:38 JST for 10 free credits; the original GLB was downloaded around 14:39 JST. The source contains 96,572 triangles and 48,284 vertices. No paid upgrade, API call, or Community publication was used.

In Blender 5.2.4 LTS, Codex imported that mesh, inspected its outer shape and hollow underside, reduced it to **1,440 triangles / 718 vertices**, smoothed its normals, and applied one pale aqua matte material. The generated crown, brim, hanging loop, and inner shell were retained. The underside was already open, so no replacement geometry or bottom-opening repair was needed. The dimensions were adjusted to approximately **0.18010 m diameter × 0.13997 m height**, with the origin centered at the inner base and its lowest rim at Y=0 in the GLB. The export uses meters, +Y up, and the project's +Z forward convention. There are no texture files or external resource URIs.

The `.blend` was reopened successfully with one mesh object and one material. The exported GLB was reimported into Blender to verify counts, bounds, and orientation. Front and underside renders were inspected; upward rays from the central underside first meet the inner crown rather than a bottom cap. A combined Cycles render of the actual duck and hat GLBs was checked with `socket_hat` at duck-local Y=0.270 m: the head enters the hollow hat and both eyes remain visible. Attach using the full socket transform; no hidden offset is built into the hat mesh. The game must still verify attachment while moving and turning.

The unmodified download is preserved separately. File hashes and measured limits are in `../ledger.csv` and `../manifest.json`. Before saving the editable file, temporary preview objects were removed and file-browser directories cleared; limited scans of the raw GLB metadata, adjusted `.blend`, and final GLB found no personal-path, common credential-pattern, or private-URL matches. This is not an exhaustive confidentiality or rights guarantee.

## Attribution and rights

**Duck sauna hat: generated with [Meshy](https://www.meshy.ai/) using Meshy 6 Lite, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).** Modified by the Sento Duck Explorer project in Blender: polygon reduction, smooth shading, material assignment, metric scale, base-centered origin, and GLB export. These model files retain their CC BY 4.0 conditions; the repository's MIT code license does not replace them. Source: the generated-stage file and reference-stage provenance listed above, under [Meshy's terms](https://www.meshy.ai/terms-of-use), checked on 2026-11-20. No endorsement by Meshy is implied.

The original reference image has its own MIT release of project-held rights, described in `ref/README.md`. Generated-image provenance and model licensing remain distinct. See [service-selection.md](../service-selection.md) for the service's data-use policy and Community-license distinction.
