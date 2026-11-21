# Washing-station distance LODs v01

This record covers geometry derived in Blender 5.2.4 LTS from the unchanged,
source-derived v02 bath stool and wash basin. It does not replace their near-view
models. [Open the fixed-camera comparison gallery](index.html) or inspect the
[export/reimport measurements](measurements.json).

| Asset | High, unchanged | Medium | Far | Medium bytes | Far bytes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Bath stool | 4,610 triangles | 1,600 | 1,000 | 30,648 | 19,844 |
| Wash basin | 2,816 triangles | 896 | 384 | 17,580 | 8,352 |

## Runtime contract

The four independently exported candidate files are `bath_stool_lod_medium.glb`,
`bath_stool_lod_far.glb`, `wash_basin_lod_medium.glb`, and
`wash_basin_lod_far.glb`. Each contains one object named after the filename stem.
Exactly one level is visible per placed object. High remains the existing
canonical GLB. Every level shares its exact authored metric bounds, bottom-center
origin, +Y-up export frame and material definition; compute placement scale from
high once and reuse it. The generator writes candidates under
`.local/environment-refresh/lod/`. After independent material QA, identical
copies were placed in `public/models/` with license files, measured manifest
entries and inherited source/own Blend/final ledger records. Their URLs remain
unregistered: whole-scene budget, game rendering and final integration are
separate from acceptance of these exported shapes.

The integration policy uses high through 1.6 m (at most two per kind), medium
for **all remaining objects through 4.5 m**, and far beyond 4.5 m or in overview.
Medium has no quantity cap. Distance is measured to the slot center. Placement
scale is derived from the high model only. While medium loads, high is preferred
over a ready far model. With the complete detail set, the conservative maximum
for all five stool/basin pairs is 22,340 triangles: two high pairs plus three
medium pairs. This is a washing-station bound, not a whole-scene measurement.

Far has visible faceting in the enlarged inspection renders. At 55° vertical
FOV and 720-pixel viewport height, a 0.36 m stool spans about 55 pixels at 4.5 m.
Its 5.04 mm sampled maximum deviation projects to about 0.77 pixels. The basin's
2.84 mm maximum projects to about 0.44 pixels before its runtime 0.9 uniform
placement scale. These are local depth/projection estimates, not pixel-error
bounds or game measurements. Integrated switching appearance and frame rate
remain the integration owner's checks.

### Rejected runtime policy

The initial integration contract capped medium at one object per kind. Five
slots are spaced 1.2 m apart, so two adjacent slots can both be just beyond 1.6 m
and the second would fall to far after the medium slot was used. For example,
an eye at (5.2, 0.42, 2.2) is 1.611 m from both stool slot centers
(4.6, 0.15, 0.73) and (5.8, 0.15, 0.73). This follows selection math, not a
verified gameplay camera capture. At 1.6 m, the stool spans roughly 156 pixels
and its maximum sampled surface deviation projects to about 2.18 pixels; the
basin maximum projects to about 1.23 pixels before its 0.9 placement scale.

Independent asset QA rejected that policy because the stool's simplified side
arches and the basin's 16-sided rim were visibly angular nearby. The runtime
owner removed the medium cap and prioritized high as the medium-loading
fallback. All four candidate GLBs stayed unchanged. The previous count cap
must not be restored without a new appearance review.

## Derivation and rejected alternatives

- Stool: copy the actual v02 runtime mesh. Keep all 126 vertices in the drain
  bevel neighborhood fixed at their source positions. Prioritize the inherited
  feature contours and foot-contact band during weighted edge collapse, clamp
  only small overshoots outside the source envelope, and transfer the original
  custom normals. The source mesh itself is never modified.
- Basin: read the actual v02 mesh's 22 radial rings and two center endpoints.
  Select existing profile points by maximum profile deviation, retaining radial
  and height extrema and the inner/outer floor endpoints. Medium uses 32 sectors
  and 14 rings; far uses 16 sectors and 12 rings. Keep the open interior, rolled
  rim, taper and closed solid floor; transfer the v02 custom normals.
- Reject the initial 650-triangle stool: its hole becomes angular and sampled
  canonical-to-LOD maximum deviation reaches 9.81 mm. A 900-triangle version
  without fixed drain vertices improves the legs but leaves the hole angular.
  Fixing the whole drain bevel at 900 retains the hole but shifts the error into
  the legs. The accepted 1,000-triangle version preserves the drain and lowers
  that sampled maximum to 5.04 mm. The extra 350 triangles are a deliberate
  shape-quality allowance, while remaining 78% below the unchanged high model.

Blender's weighted collapse treatment was checked against its
[implementation](https://github.com/blender/blender/blob/main/source/blender/bmesh/tools/bmesh_decimate_collapse.cc).
Zero-weight drain vertices are fixed; lower nonzero weights prioritize other
feature contours. Raising the weighting factor alone did not improve the
measured shape and was not adopted.

## Verification

All four actual GLBs were freshly reimported, measured and rendered. Each is one
connected, finite solid with zero non-manifold edges after export-seam welding
and zero degenerate faces. Bounds match high within 1 μm. Each stool retains four
separate lower legs, all four feet at zero height, and five unobstructed rays
through the drain in both directions. Each basin retains an approximately
84.832 mm cavity and 5.685 mm closed floor. Both stool LODs retain the 126 fixed
drain vertices at their exact source positions before export.

| Asset / level | Canonical→LOD mean | 95th percentile | Sampled maximum |
| --- | ---: | ---: | ---: |
| Stool medium | 0.251 mm | 0.845 mm | 1.604 mm |
| Stool far | 0.765 mm | 2.328 mm | 5.037 mm |
| Basin medium | 0.385 mm | 1.026 mm | 1.514 mm |
| Basin far | 0.973 mm | 1.992 mm | 2.835 mm |

Distances sample every vertex and triangle centroid in both directions against
the other surface; these are not continuous Hausdorff bounds. Reverse-direction
numbers, source/output SHA-256 values and all topology facts are in the JSON.
The four views per level use identical camera, illumination and materials for
the same asset. Review found the medium forms consistent with high, retained
capsule openings on the stool and intact basin interiors. Far loses small bevel
detail and has visible angular contours at this enlarged scale.

Every GLB has one material whose JSON is identical to canonical, no textures or
external buffers, and no exported camera or light. Editable LOD Blends retain the
original v02 runtime geometry and inherited raw Meshy geometry exactly through a
save/reopen check. Original canonical GLB and source-v02 Blend file hashes remain
unchanged. Saved Blends were decompressed and checked for private path/account
markers; none were found. The 24 PNGs have text and EXIF chunks removed.

These are local asset checks. No browser, game performance measurement, full
test suite or normal-input playthrough was run for this LOD task.

## Reproduce and edit

Run `blender --background --python scripts/build-wash-lods.py` from the repository
root with Blender 5.2.4 LTS and `zstd` available. The script checks the fixed
canonical hashes before producing candidates, editable Blends, renders and the
measurement record. It does not promote files into `public/models`.

- [Stool editable LOD scene](../../../bath_stool/blend/bath_stool__lod_v01.blend)
- [Basin editable LOD scene](../../../wash_basin/blend/wash_basin__lod_v01.blend)
- [Stool source refinement](../../../bath_stool/blend/bath_stool__v02.md)
- [Basin source refinement](../../../wash_basin/blend/wash_basin__v02.md)

## Attribution

These GLBs, editable Blends and preview PNGs are modifications by the Sento Duck
Explorer project of models generated with [Meshy](https://www.meshy.ai/),
Meshy 6 Lite, and remain under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Keep the original [stool credit](../../../bath_stool/ATTRIBUTION.md) and
[basin credit](../../../wash_basin/ATTRIBUTION.md), this indication of LOD
modifications, and the license link when redistributing. No Meshy endorsement is
implied. The repository's code license does not replace this asset license.
