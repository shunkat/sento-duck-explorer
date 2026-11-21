# Compact adult NPC revision v02

This limited revision updates only the standing reception staff and the standing bath NPC. The accepted seated candidate and `sento_npcs__v01.blend` remain byte-identical. The private v01 files were preserved before replacement. The unchanged Adult image/raw/master chain and CC BY 4.0 attribution remain recorded in the parent asset.

Both compact exports are 1600 triangles, one material and one embedded 512-pixel texture, with height 1.600 meters and bottom-center origins. Staff measures 0.555510 × 1.600000 × 0.324151 meters; bath measures 0.555174 × 1.600000 × 0.324871 meters (glTF XYZ). They fit their original 0.6 × 0.45 and 0.6 × 0.4 XZ footprints at unit scene scale. The source shoulder joint is relaxed locally, then upper/lower arm segments are rotated into a natural arms-down pose. Head, face and lower-body proportions are retained, followed by one uniform height normalization. There is no whole-model nonuniform scaling or Child-sized Adult substitution.

The overall minimum Y is zero. Independent inspection found the other sole about 0.172 mm above the plane for staff and 1.631 mm for bath; exact simultaneous zero contact for both soles is not claimed. Actual environment placement, crowd gaps and scene budget remain integration checks.

## Green-jaw diagnosis

The old staff GLB was rendered with the same camera, materials, area lights and world three times: Cycles diffuse/glossy bounce limits 4, limits 0, and basecolor-only emission. The green region below the ear and jaw appears only with indirect lighting. A fixed head-region pixel rule counted 4206 green pixels with bounce lighting, zero with direct lighting and zero with emission. The old and new embedded staff basecolor PNGs are byte-identical, confirming no texture recolor or hidden repair was used.

This is teal-shirt light reflected into the underside of the head. Current inspection images use direct lighting to match the game's non-path-traced lighting assumptions. The comparison, exact hashes and control settings are in [lighting-diagnosis.json](../quality/compact-v02/lighting-diagnosis.json) and the adjacent `v01-staff-{indirect,direct,unlit}.png` images. This explains the review artifact; runtime material appearance still belongs to scene-level review.

## Reproduction and verification

Run `Blender --background --python scripts/build-sento-npcs.py -- --compact`. This rebuilds only these two models and their 12 pose/face images, saves this revision's separate Blend, checks the existing seated candidate/source when present, reimports the actual GLBs, and audits saved assets. The historical v01 candidate set is rebuilt by omitting `--compact`; it is not the current staff/standing set.

[Measurements](../quality/compact-v02/measurements.json), [audit](../quality/compact-v02/audit.json), [placement preflight](../quality/compact-v02/placement.json) and [validation](../quality/compact-v02/validation.json) record the frozen files. Independent asset review accepted both compact candidates without mandatory shape findings. No game playback, scene-placement or publication success is inferred from these asset checks.
