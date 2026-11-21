# Adult character model

**Current revision: [v02](blend/adult__v02.md), 2026-11-21.** The detailed generated source is used again to correct the face, shoulders, arm pose and clothing boundaries. Limb weights exclude the legs, and the authored hand/carry/label socket contract is preserved. See [clothed comparison](../quality/existing-models/adult-clothed/index.html) and [bath comparison](../quality/existing-models/adult-bath/index.html). This remains a static model. Current measurements are in the ledger/manifest; the following v01 record is historical.

## Archived v01 production record

Created on **2026-11-20** through the required **reference image → Image to 3D → Blender adjustment → GLB** pipeline. Codex operated the image, Meshy, and Blender steps. The bathing variant is a Blender derivative of the same generated clothed-reference geometry; no replacement primitive character was substituted.

| Stage | File |
| --- | --- |
| Original reference | `ref/adult__ref_threequarter_v01.png` |
| Unmodified Meshy output | `gen/adult__meshy6lite_raw_v01.glb` |
| Editable Blender scene | `blend/adult__v01.blend` |
| Game export | `../../public/models/adult.glb` |

Meshy Free / **Meshy 6 Lite**, with **Texture off**, was used for **10 credits**. The raw output was downloaded around **14:51 JST**. The UI identified its license as **CC BY 4.0**. The preserved raw GLB contains **64,044 triangles / 32,024 vertices**, without materials or textures. All four stage hashes are in `../ledger.csv`.

## Blender modifications

Blender **5.2.4 LTS** was used to inspect the actual source, retain its head, face and hair, broaden the shoulders locally, lower the arms from the source A-pose, and bend the right forearm into a static carrying pose. The result is **1.70 m** tall, with +Y up, +Z forward and the origin centered on the bottom of the horizontal bounds.

Two complete static meshes are derived from the source, each with **5,800 triangles**, for **11,600 triangles total**. The clothed variant has short brown hair, dark eyes, a small smile, a teal T-shirt, charcoal knee-length shorts and bare feet. The bathing variant has an opaque, continuous, featureless toy silhouette: the source garment surfaces are reshaped locally, with sleeve and shorts-hem steps smoothed and thighs rounded. No sexual anatomy was added. This is the game's bathing-state doll representation, not swimwear or a towel intended to enter the bath.

Project colors were defined from source-space regions and baked onto the final low-poly UV maps. Each variant has one **1024 × 1024** embedded base-color image and one matte PBR material; the whole GLB has **two materials / two textures**, with no external image dependencies. These colors and textures were made in Blender, not downloaded from Meshy. The head and eye colors were checked in front and three-quarter renders after the bake.

The shoulder silhouette measured in the **Y=1.15–1.25 m** upper-shoulder band is approximately **0.6557 m clothed / 0.6515 m bathing**; the full horizontal span is approximately **0.7154 m**. Exact exported bounds, counts and socket coordinates are in `../manifest.json`. Socket nodes are excluded from mesh dimensions.

## Runtime contract

The `adult` root contains full-body mesh nodes **`outfit_clothed`** and **`outfit_bath`**, with no `head_shared`. The loader **must show exactly one outfit before the first draw**, according to the existing game clothing state. Both are included in the GLB. The `default_outfit = clothed` extra is descriptive metadata, not a glTF visibility rule. The editable Blender file opens with the bathing mesh hidden. Scope name lookup to this character's root because Child uses the same outfit-node names.

- `socket_carry`: **(-0.24, 0.90, +0.20) m**, identity rotation. Attach the Duck root (bottom origin) using the full socket transform. The Y=0.90 m core contract is preserved; the forward offset avoids burying the duck in the torso.
- `socket_hand_r`: approximately **(-0.30771, 0.87232, +0.22017) m**, at the actual right hand. Negative X is the character's right when facing +Z.
- `socket_label`: **(0, 1.85, 0) m**, above the head.

The actual exported Duck and Hat GLBs were attached for [three-quarter](blend/adult__carry_threequarter_v01.png) and [close side](blend/adult__carry_side_v01.png) inspection. The duck rests near the raised right hand without its body sinking into the torso. This is a **static one-hand carrying pose**, not a rig, walking animation, pickup animation or two-handed grip. Future movement and pose blending require separate work.

## Verification and attribution

The editable scene was reopened and the final GLB reimported to verify both meshes, packed images, dimensions and sockets. Visual checks include [clothed front](blend/adult__clothed_front_v01.png), [bath front](blend/adult__bath_front_v01.png), [bath back](blend/adult__bath_back_v01.png) and the carrying composites above. Limited binary/text and PNG-metadata checks found no personal filesystem paths, common credential patterns or private URLs; this is not an exhaustive confidentiality guarantee.

**Exported asset status does not mean game integration or a completed browser playthrough.** Runtime outfit switching, carried-item attachment, camera framing and the full route need their integration checks. The game must continue to enforce its existing clothing and safety rules.

Meshy-derived geometry, adjusted scenes, textures, exports and derived previews are **CC BY 4.0**, separately from the MIT code and reference-image rights. See [ATTRIBUTION.md](ATTRIBUTION.md) and `public/models/adult.LICENSE.txt` in the repository.
