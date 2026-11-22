# Independent visitor distance models

These three static models are derived only from the accepted Quaternius-based
near visitors. They retain the exact embedded 512px atlas bytes, authored frame
and floor contact. Original CC0 sources and project MIT modifications are
covered by [the parent attribution](../ATTRIBUTION.md).

| Role | Triangles | Bytes |
| --- | ---: | ---: |
| Reception | 593 | 62,448 |
| Standing visitor | 594 | 62,284 |
| Seated visitor | 594 | 69,144 |

The maximum near/far min-or-max bounding-vector difference is 19.731mm, below
the runtime 40mm check. The seated frame includes the same forward offset as
the near source. Its triangles also pass the actual seat-board envelope check.
No far mesh has degenerate triangles; all original near inputs remain intact.

The reduction protects eyes, eyebrows, hair boundaries, beard and contact
regions. The seated body's normals are computed directly from triangle cross
products, with sharp folds split; protected head normals retain the source
surface. This prevents broad reduced hip triangles from inheriting underside
normals and producing a false dark patch.

Each exact exported GLB was reimported for front and three-quarter comparison,
and at 1280×720, vertical FOV55°, 6.1m camera-to-model-center distance. The
independent review found no required defects at the intended distance. The
hands, feet and torso are visibly faceted in enlargement; these models are
accepted only beyond the existing 6m switch or in Overview, not for close-up
use. No claim of measured GPU frame time or normal-input gameplay is made.

Exact source/export/Blend hashes, atlas hashes, bounds, contact checks and
render hashes are in `quality/*_lod_measurements.json`. Editable files are in
`blend/`. The detailed original near masters remain in the parent directory.

```sh
Blender --background --python-exit-code 1 --python scripts/build-distinct-npc-lods.py
```

The producer reads private near candidates and writes private far candidates;
it never activates the public models. Rebuild and review the near candidates
first, then freeze inputs before reconstruction or integration.
