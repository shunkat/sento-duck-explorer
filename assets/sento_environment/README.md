# Sento environment v02

The world keeps the existing Kenney geometry, Poly Haven materials, project
rooms/equipment and mural. Seven adult NPC placements now use three independent
Quaternius-based visitors instead of the playable father. See
[visitor sources and review](../sento_visitors/README.md).

The replacement contains **7,996 architecture triangles + 12,157 NPC triangles
= 20,153 triangles**, with 17 materials, 11 images and 5,931,660 bytes. It retains
all 64 node names, hierarchy and transforms. The 26 non-NPC meshes, 14 non-NPC
materials and eight non-NPC image payloads are unchanged. Exact accessor and
payload hashes are in [replacement proof](quality/v02/replacement-proof.json).

The seated visitors use the existing bench placement frame, with their local
geometry moved forward to put the lower legs beyond the actual board edge.
The floor remains Y=0. The source's low underside was adjusted at six vertices;
all triangles are checked against the seat-board interiors, including triangles
whose vertices lie outside the board but whose interiors cross it. This caught
a defect that sampled support rays had missed. The eleven original openings
and all five occupied benches have zero intersecting NPC triangles in the
accepted near export; far-seat checks are recorded with the visitor LODs.

[Current measurements](quality/measurements.json) distinguish raw triangle area
from the old bmesh calculation. There are 16 unchanged zero-area architecture
triangles in the old bench geometry, and zero degenerate NPC triangles. The old
bmesh method reported zero because of numerical rounding; the replacement does
not claim that those original architecture triangles were repaired.

## Sources and reconstruction

The original construction and measurements are preserved as
[v01 documentation](README-v01.md), [v01 GLB](blend/sento_environment__v01.glb),
[v01 editable source](blend/sento_environment__v01.blend), and `quality/v01/`.
The new [v02 editable scene](blend/sento_environment__v02.blend) is a verified
reimport of the exact composed GLB, with all images packed. Original detailed
construction and independent visitor masters remain available separately.

Rebuild the visitor candidates first, then run:

```sh
node scripts/export-environment-layout.mjs .local/distinct-sento-npcs/layout.json
python3 scripts/replace-background-npcs.py
python3 scripts/measure-replaced-world.py
Blender --background --python-exit-code 1 --python scripts/save-replaced-world-blend.py
Blender --background --python-exit-code 1 --python scripts/render-replaced-world.py
```

These tools produce private candidates and reports. They do not replace public
assets or deploy. Their default source is the versioned v01 GLB and v01 opening
record. For a future changed layout, supply the matching world/reference inputs
and recheck the complete placement contract; do not apply the old layout hash
without verifying the changed map.

The composite remains CC BY 4.0. Independent public CC0 and project MIT inputs
retain their licenses. See [distribution notice](../../public/models/sento_environment.LICENSE.txt)
and `assets/ledger.csv` for authors, actual inputs, modifications and hashes.
No paid assets were used.

## Actual export inspection

These are Blender reimport renders of the composed GLB with inspection lights.
They establish asset placement, not game-lighting or normal-input play results.
The combined final game remains subject to the shared final verification handoff.

![Reception](quality/v02/npc_reception_v02.png)

![Seated visitors](quality/v02/npc_seated_contact_v02.png)
