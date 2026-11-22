# Human walking rig, revision 03

These editable sources add a shared 13-bone rig to the existing generated human
models. They retain the original Meshy 6 Lite provenance and CC BY 4.0 terms in
the child/adult asset records. No new generation service or paid asset is used.

`scripts/rig-human-models.py` reads the source-derived revision 02 Child and the
face-corrected revision 03 Adult. It preserves both outfit meshes, their UVs,
materials and vertex positions, and adds normalized linear-blend skin weights
with at most four influences per vertex. Anatomical masks use the preserved
`reference_position` attribute, before the source arms were posed; a bent hand
near a thigh therefore does not accidentally assign the thigh to the arm.

The shared bones are `hips`, `spine`, `head`, and left/right `upper_arm`,
`forearm`, `thigh`, `shin`, `foot`. Arm joints follow the existing two-segment
source pose. The hand socket follows the right forearm while preserving its rest
transform. Carry and label sockets retain their root-space rest transforms.
The geometry budgets remain 5,600 triangles per Child outfit and 5,800 per Adult
outfit; only one outfit is visible in the game.

Motion is supplied by the runtime from actual movement. These GLBs contain a
skin, not baked animation clips, and do not claim the separate idle/run/dry/hold
clip set is finished. Root-space X rotations are converted through each bone's
rest frame. Foot rotations counter the leg rotations and the runtime moves the
whole character root down by the lowest ankle's rise, maintaining support-foot
contact without moving attachments independently of the character.

Rebuild from the repository root with Blender:

```sh
blender --background --python-exit-code 1 --python scripts/rig-human-models.py -- \
  --adult-source assets/adult/blend/adult__face_uv_v03.blend --render
```

Candidates are written under `.local/human-face-walk/rig/`; the script never
replaces public models. `blend/` holds the editable outputs. `quality/` holds
measurements, metadata audits, and front/side/three-quarter views rendered from
the reimported candidate GLBs in both outfits and opposing stride poses.
Blender's importer creates a hidden Icosphere for bone display; it is excluded
from the measurements and is absent from the GLBs.

The asset checks cover deformation, socket tracking, finite bounds, geometry
counts, metadata and representative walking poses. They are not a normal-input
gameplay test. Full game/runtime acceptance is recorded by the release owner.
