# Yellow wash basin — selected v02

Produced through **reference image → Meshy Image to 3D → Blender adjustment → GLB**. v02 passed the fixed-condition material critique and is connected in the local finishing branch. In-game appearance, performance and the deferred normal-input playthrough remain unverified.

| Stage | File |
| --- | --- |
| Reference | [Single-object image](ref/wash_basin__ref_threequarter_v01.png) |
| Generated source | `gen/wash_basin__meshy6lite_raw_v01.glb`, unchanged Meshy 6 Lite output |
| Editable source | `blend/wash_basin__v02.blend`, original source, master, radial profile and low mesh kept separately |
| Candidate measurements | [Counts, dimensions, hashes and surface differences](quality/v02/measurements.json) |
| Candidate inspection | [Production decisions and local views](quality/v02/inspection.md) |
| Fixed-condition comparison | [v01 / v02: beauty, clay, silhouette and reflection](../wash_station/quality/v02/wash_basin/index.html) |

Meshy Free / Meshy 6 Lite / texture off was used on 2026-11-21, consuming 10 free credits. No paid generation or subscription was added. The untouched generated source has 97,848 triangles and 48,926 vertices. The previous process and measurements are retained in [the historical v01 record](blend/wash_basin__v01.md).

## What changed

v01 stretched each axis independently to fill the placement envelope. Treating that stretch as mandatory was an incorrect judgment: it made the round source oval and increased its height. v02 scales the original uniformly to a 0.20 m diameter, preserving its natural height of about 0.0904 m. These are authored scale choices derived from the source, not measured real-world basin dimensions.

Twelve actual radial cuts of the generated mesh are averaged into an editable 32-point profile. A subdivided 46,848-triangle master retains the rolled rim, wall taper, hollow interior and closed bottom. The game candidate uses a curvature-adaptive profile with 64 sectors and 22 rings, plus custom normals transferred from the clean master. It is derived from the generated geometry, not replaced by an unrelated primitive.

The candidate has **2,816 triangles / 1,410 vertices / 52,320 bytes**, one material and no textures. Reimported dimensions are **0.200000 × 0.090517 × 0.200000 m (X × Y × Z)**, +Y up, with a bottom-center origin. The centered floor is 5.685 mm thick and the interior is 84.832 mm deep. The mesh has zero nonmanifold edges and only finite coordinates.

Runtime placement uses one uniform scale to fit within the existing envelope and fixes the bottom position. Collision geometry remains separate; the round model is not stretched to fill every dimension. Counts and final export hashes are recorded in the measurements rather than inferred from the working scene.

The sampled master-to-low surface distance is 0.527 mm maximum and 0.385 mm at p95; the reverse direction is 0.108 mm maximum. These vertex-to-surface samples are not a continuous Hausdorff or pixel-error guarantee. The 5,856-triangle initial candidate and smaller alternatives were compared before selecting this allocation. A rim-only optimization that introduced a shading band was rejected.

## What remains

The same-condition multi-view review shows the former deep, oval bucket shape has been corrected while keeping the opening and solid floor. Small close-up silhouette differences remain. A [color-only comparison](quality/v02/color-ab/index.html) under the same camera and lighting selected a brighter yellow material, reducing the earlier dark mustard/olive appearance. Geometry and normals stayed byte-identical. Exact color matching to the differently lit image reference is not established. A rendered asset is not user visual acceptance or gameplay verification.

The `.blend` preserves the imported original, a uniform-scale copy, editable master and explicit profile. Exported GLB is reimported for the inspection images. PNG text/Exif metadata is removed without changing pixels; scoped binary and external-reference checks are recorded under `quality/v02/`. These checks are not a complete privacy or rights audit.

## Reproduction and attribution

Run `Blender --background --python scripts/refine-wash-basin-v02.py` from the repository root with Blender 5.2.4 LTS. It writes the v02 editable scene, a local candidate and inspection outputs; it does not overwrite the original, v01, reference, public model, manifest or ledger. Final publication/integration is a separate step.

The generated model, modified Blender scene, GLB and derived previews retain **CC BY 4.0**, with attribution to Meshy and an indication of modifications. See [ATTRIBUTION.md](ATTRIBUTION.md) and [the distribution notice](../../public/models/wash_basin.LICENSE.txt). The reference image has its own [release of project-held rights](ref/README.md). The repository’s MIT code license does not replace the asset license.
