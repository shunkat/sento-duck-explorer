# Sento NPC source-derived candidates

The reception staff and sauna crowd replace generic background body shapes with derivatives of the actual image → Meshy → Blender Adult asset. These are static scenery candidates, not independently generated humans or animated characters. Parent reference, generated raw output and detailed masters are preserved; no new service spending is involved. See [attribution](ATTRIBUTION.md).

The current reception and short-band candidates are **[compact revision v02](blend/sento_npcs__compact_v02.md)**: both retain natural 1.600-meter adult height, with arms down and a relaxed shoulder pose. Their footprints are about 0.556 × 0.325 meters, so the original staff and short crowd boxes can contain them. The seated v01 model and its Blend remain unchanged. Current compact measurements, audit and lighting diagnosis are in `quality/compact-v02/`; the older sections below describe the retained v01 development evidence.

To rebuild only the two updated candidates, run `Blender --background --python scripts/build-sento-npcs.py -- --compact`. This does not regenerate the unchanged seated model or its images. The default command below reconstructs the historical v01 set and therefore replaces the private staff/standing candidates with that historical revision.


Run `Blender --background --python scripts/build-sento-npcs.py` from the repository. The script saves `blend/sento_npcs__v01.blend`, emits private candidate GLBs under `.local/environment-refresh/npc/`, reimports those exact GLBs for measurements and fixed-condition front/three-quarter/side/back/face renders, and audits the saved files. It does not promote models to `public/`, change gameplay colliders, or deploy.

The saved scene contains the unchanged `SOURCE_RAW_UNMODIFIED`, original detailed clothed/bath masters, derived `DETAIL_npc_*` masters and export roots `npc_staff`, `npc_seated`, `npc_bath_standing`. Runtime meshes are children of the correspondingly named root. Coordinates export as +Y up, +Z front, meters, with bottom-center roots. `npc_seated/seat_anchor` marks the intended support surface at glTF `(0, 0.45, -0.18)` meters.

## Quality decisions

The first 1000-triangle seated trial baked a new color field onto coarse triangles and produced eye/brow/mouth seams. It was rejected. The retained method starts from the corrected Adult runtime surface, preserves the original facial UV patch, copies the baked texture and reduces it to 512 pixels. Collapse weights protect the face, shoulder outline, hands and hips. Newly collapsed points are reprojected to the detailed inherited surface before posing; custom normals are transferred from the posed detailed master afterward.

A 1300-triangle seated revision retained coherent eyes and mouth but lost shoulder and hip silhouettes. The final candidate uses 1800 triangles, with fixed gray-material comparisons of the high master and reduced mesh to distinguish actual pose shape from reduction loss. The static pose bends thighs and shins separately, blends the hip transition and carries both arms toward the knees. All reference/raw data remain inherited by SHA instead of duplicated. Neither whole-body smoothing nor subdivision inflation is used as a quality claim.

## Placement and review limits

Every candidate is inspected in isolation and remains subject to the integration review. The standard seated model exceeds the old 0.6-meter band width at unit scale. A uniform scale near 0.90 with a quarter-turn permits the normal bands to use the model's depth across their short axis; the bench surface must follow the scaled seat anchor (0.405 meters at scale 0.90), with feet remaining on the ground. No axis is compressed independently.

The shortest crowd band is only 0.6 by 0.4 meters. The supplied standing-bath comparison candidate does not fit at natural adult size. A trial proposal to shrink it to about 1.24 meters tall was rejected because this would make the Adult almost the same height as the Child. That v01 limitation is resolved by the natural-height compact v02 arms-down derivative linked above. Exact bounds and placement preflight are in [placement.json](quality/placement.json). Existing 0.6-meter crowd gaps must not be filled by visible overhangs.

The historical v01 reception candidate also exceeds its old 0.6 by 0.45-meter fixture footprint at natural adult height; actual counter clearance remains an integration question. These candidates retain stylized source hands/feet and some low-poly hair, shoulder and knee facets. They are background models, not close-up hero replacements. The 1800-triangle seated candidate exceeds the initial 1000-triangle target by 800 triangles per instance; scene budget and quality acceptance are reported separately. No gameplay, frame-rate, full playthrough, scene placement, or production-publication success is claimed by the asset evidence.

Exact counts, bounds, hashes and contact rays are in [measurements.json](quality/measurements.json) and [audit.json](quality/audit.json). The audit reopens the saved Blend, compares the raw geometry with a fresh raw import, verifies unchanged original masters and parent hashes, checks packed texture pixels, parses PNG/GLB metadata, and scans the decompressed Blend for common private markers. This is scoped hygiene, not an exhaustive confidentiality guarantee. Material and full-scene visual acceptance belong to the independent integration review.
