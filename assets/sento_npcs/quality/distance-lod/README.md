# NPC distance detail

These three 600-triangle far models are derived from the actual accepted seated v01 and compact-standing v02 GLBs. Original NPCs remain unchanged. The editable scenes preserve the real parent geometry and packed texture; the saved source was compared with a fresh import. Export-seam positions are welded while preserving loop UVs before weighted collapse, then original custom normals are transferred. The first unwelded trial failed topology inspection and was not accepted.

Use far only when camera-to-model-center distance exceeds 6 meters, or in Overview. Near detail remains 1,600/1,800 triangles without a quantity cap. Every slot uses the near model's original position, rotation and uniform scale; no low-detail bounding-box renormalization is permitted. Missing or invalid NPC sources keep the existing environment until the complete set is usable.

Independent QA inspected all 18 high/far images, including 6.2-meter perspective views at 55 degrees and 720 pixels. Faces, eyes and poses remain readable at that distance. Close-up shoulder, hand, foot and seated-hip contours become visibly angular; near-camera use was rejected. Code review found no required changes, and seven targeted tests across three files plus typecheck passed. These are asset/code checks, not actual game-rendering or whole-scene performance results.

Measurements and hashes are in `measurements.json`; saved-source, packed-image and scoped decompressed-Blend inspection are in `audit.json`. All three actual GLBs are finite, have no degenerate faces and have zero nonmanifold edges after UV seam welding. Source GLBs and all original parent files are unchanged. Inspection PNG text/EXIF chunks were removed; original geometry/textures were not modified by metadata cleanup.

The original images → Meshy 6 Lite → Adult → posed NPC lineage remains **CC BY 4.0**, including these modifications and preview images. Credit [Meshy](https://www.meshy.ai/), keep the [license link](https://creativecommons.org/licenses/by/4.0/) and describe these distance-detail changes. The project's code license does not replace the model license. See the parent `assets/sento_npcs/ATTRIBUTION.md` and `assets/ledger.csv`.

Reproduce with Blender 5.2.4 LTS: `blender --background --python-exit-code 1 --python scripts/build-npc-distance-lods.py`. Candidate files are written to `.local/environment-refresh/npc-lod/`; registry activation and public publication are separate steps.
