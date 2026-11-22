# Sento environment v05 — growth route and independent visitors

The combined world preserves the current growth route and its two dynamic doors,
while adding the reviewed independent Quaternius visitors, original tattoo art
and corrected inward-facing Mount Fuji mural. Seven background adult placements
use distinct visitor models; none uses the playable father's geometry.

The exported world measures **9,907 architecture + 12,157 NPC triangles = 22,064**,
**6,850,416 bytes**, 17 materials and 11 embedded images. The existing 10,000
architecture / 22,200 world triangle budgets and 7 MB limit are unchanged.
The runtime applies its separate scene-wide limits and distance variants.

## Integration and reproducibility

Both parents are preserved: [v04](README-v04.md) and
[growth v02](README-growth-v02.md), including their GLBs, editable sources,
measurements and distribution notices. The merged revision uses the reviewed
`growth_v02` patch on the archived v04 GLB. It does not re-export the entire world
through Blender. The geometry fingerprints must match before patching.

```sh
python3 scripts/merge-environment-patch.py \
  --base assets/sento_environment/blend/sento_environment__v04.glb \
  --patch assets/sento_environment/patch/growth_v02/growth_environment_patch.glb \
  --contract assets/sento_environment/patch/growth_v02/patch-contract.json \
  --output .local/combined-world.glb
```

The output SHA-256 is
`98f43e692fa430c2595acdf7c879a004735b4d0bc1b503a00fa69889b6cdde46`.
The complete v04 binary prefix and its source images remain intact. Eight named
architecture batches are replaced; child-area and street roots are added.
Current LEVEL geometry, all seven visitor transforms, the original tattoo
atlas and the corrected Fuji UVs are retained. The patch also removes the
16 historical zero-area cedar triangles; current raw-area checks find none.

`growth_kids_gate` and `growth_front_exit` remain direct children of
`sento_environment`. Opening a door hides its whole root; overview hides only
its `_upper` child. The front aperture is at x=11. Runtime water remains separate.
The [packed v05 Blender scene](blend/sento_environment__v05.blend) is an editable
reimport of the combined export; detailed construction sources remain archived.

## Verification and rights

[Measurements](quality/measurements.json), [self-review](quality/self-review.json)
and [metadata audit](quality/metadata-audit.json) describe the actual combined
GLB. Raw geometry checks cover the current passage openings and all five occupied
bench boards. Blender reimport renders establish geometry, materials and
placement; game lighting and normal-input checks are recorded separately in
[combined release verification](../../docs/combined-assets-release-verification.md).

Kenney geometry, Poly Haven textures and Quaternius visitor sources remain CC0.
Project geometry and original generated artwork retain project-held MIT rights.
The assembled world retains its CC BY 4.0 composite notice; independent component
licenses remain effective. [Distribution notice](../../public/models/sento_environment.LICENSE.txt),
[public sources](../public_sources/README.md) and the asset ledger preserve the
source files, modifications, rights and hashes. No paid assets were used.
