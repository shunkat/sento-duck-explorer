# Child character model

**Current revision: [v02](blend/child__v02.md), 2026-11-21.** The original generated mesh is corrected again from the detailed source: smoother shoulder/arm transitions, clean facial and clothing colors, balanced reduction, and separate clothed/bath exports. The hand/label contract is preserved. See [clothed comparison](../quality/existing-models/child-clothed/index.html) and [bath comparison](../quality/existing-models/child-bath/index.html). Current files and measurements are in the ledger/manifest; the following v01 record is historical.

## Archived v01 production record

Created on **2026-11-20** through the required **reference image → Image to 3D → Blender adjustment → GLB** pipeline. Codex operated the image, Meshy, and Blender steps. The reference shows a clothed original toy character; the bathing variant is a documented Blender derivative of that same generated geometry, not a separate generation or a replacement primitive character.

| Stage | File |
| --- | --- |
| Original reference | `ref/child__ref_threequarter_v01.png` |
| Unmodified Meshy output | `gen/child__meshy6lite_raw_v01.glb` |
| Editable Blender scene | `blend/child__v01.blend` |
| Game export | `../../public/models/child.glb` |

Meshy Free / **Meshy 6 Lite**, with **Texture off**, was used for **10 credits** around 14:52–14:53 JST. The UI identified the output as **CC BY 4.0**. The raw download contains **70,790 triangles / 35,397 vertices**, with no material or texture. Its exact bytes and the original reference are preserved; all four stage hashes are recorded in `../ledger.csv`.

## Blender modifications

Blender **5.2.4 LTS** was used to inspect the actual source from multiple directions, retain its face and hair, broaden the upper torso locally, and lower the arms from the source A-pose. The arm adjustment also brings the hands closer to the body for walking through the level. The final height is **1.20 m**, +Y is up, +Z is forward, and the origin is centered on the bottom of the horizontal bounds.

Two complete static meshes are derived from the original mesh. Each has **5,600 triangles**, for **11,200 triangles total** in the file. The head, face, hair, hands, and feet are retained in both; no procedural replacement character, rig, or animation is claimed.

- **Clothed:** short brown hair, dark eyes, a small dark-brown smile, skin color, a coral T-shirt, and navy knee-length shorts.
- **Bath:** the garment-bearing surface is relaxed and the shoulder width restored locally, giving an opaque, continuous, simplified toy silhouette. Sleeve and shorts-hem steps are smoothed rather than merely recolored. No realistic body detail is added. This is the game's bathing-state doll representation; it is not a recommendation to enter a sento in swimwear or to immerse a towel.

Project colors were applied to the dense, untextured source mesh and projected onto the final meshes' UV maps using an emission bake. Each variant has one **1024 × 1024** embedded base-color image and one matte PBR material. There are **two materials and two embedded textures total**; the GLB needs no external image files. Color is not attributed to Meshy's untextured output.

The final outer shoulder/upper-arm silhouette, measured in the **Y=0.64–0.80 m** band, is approximately **0.4648 m clothed / 0.4514 m bathing**, within the provisional 0.44–0.56 m limit. The full horizontal span including fingers is approximately **0.5284 m**. Exact exported bounds and counts are in `../manifest.json`; sockets are empty nodes and are excluded from geometry bounds.

## Runtime contract

Within the `child` root, the actual mesh nodes are named **`outfit_clothed`** and **`outfit_bath`**. There is no `head_shared` node: each mesh contains the full character. Both use the same origin and pose.

The loader **must select exactly one visible outfit before the first draw**, following the existing game clothing state. The GLB includes both meshes; the `default_outfit = clothed` extra is descriptive metadata, not an enforced glTF visibility rule. The editable Blender file opens with the bathing mesh hidden. Apply visibility within this character's root, since Adult uses the same outfit-node names.

`socket_hand_r` is located at the actual right hand, on negative X when the character faces +Z. `socket_label` is above the head. Their exact model-space coordinates are in `../manifest.json`. Attach held items using the socket transform; clothing changes must preserve the existing game state and rules.

## Verification and attribution

The editable scene was reopened, and the exported GLB reimported to check both meshes, packed images, dimensions, sockets, and bounds. Both outfits were visually inspected: [clothed GLB render](blend/child__clothed_preview_v01.png) and [bath GLB render](blend/child__bath_preview_v01.png). Their head geometry matches, and an inspection copy with coincident UV-seam vertices welded has zero non-manifold edges for both outfits. Limited binary and text checks cover personal paths, common credential patterns, and private URLs; they are not an exhaustive confidentiality guarantee.

**Exported asset status does not imply game integration or a completed browser playthrough.** Runtime outfit switching, held-item attachment, movement, and the full route still need the integration checks.

The Meshy-derived geometry, adjusted scene, textures, and exported model are **CC BY 4.0**, separately from the MIT code and reference-image rights. See [ATTRIBUTION.md](ATTRIBUTION.md) and `public/models/child.LICENSE.txt` in the repository.
