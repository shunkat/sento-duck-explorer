# Growth milk bottle v01

A project-authored classic milk bottle for the growth route: an opaque milk-white
body with a rounded glass-bottle heel and shoulder, a short neck and rolled lip,
and a cream paper closure with a muted blue band. Small pleats and a front thumb
edge distinguish the paper lid from a screw cap. The bottle uses the existing
[cream/teal sento art direction](../sento_environment/ref/README.md).

The original profile and materials were authored directly in Blender 5.2.4 LTS
on 2026-11-22. No downloaded model, third-party texture, new generated image or
Image-to-3D service was used. This follows the approved direct-authoring route
for new small props. The earlier character generation histories are unchanged.

| Contract | Measured exported GLB |
| --- | --- |
| Dimensions X × Y × Z | 0.072 × 0.200 × 0.072 m |
| Geometry | 1,340 triangles; 928 exported vertices; 672 after export-seam welding |
| Materials | 2 nonmetal PBR materials; body roughness 0.26, paper 0.83 |
| Textures | 0; color is stored in vertex colors |
| Transparency | OPAQUE, no transmission; readable without transparent sorting |
| File size | 43,916 bytes |
| Frame | Meters, +Y up, +Z front, bottom-center origin; base exactly at y = 0 |
| Structure | One connected closed surface after seam welding; no detached parts |

The front is identified by the small paper thumb edge, which points in glTF +Z.
The body is rotationally symmetric. Milk and glass are represented by one
opaque surface; this is a game prop rather than a hollow container simulation.
All 21 profile sections remain editable in the Blend. The lid is part of the
continuous surface, with its own material. It is not a stack of overlapping
cylinders. No brand, real facility name or product label is reproduced.

## Sources and rights

Geometry, materials, build script and offline renders are original project
work released under the repository [MIT license](../../LICENSE). Keep
[`milk_bottle.LICENSE.txt`](../../public/models/milk_bottle.LICENSE.txt) with the
runtime GLB. Detailed hashes, creator, production route and inherited art
reference are in [provenance.json](provenance.json), the shared
[ledger](../ledger.csv) and [manifest](../manifest.json). The existing style
reference retains its own original OpenAI provenance; it was not converted
to a 3D model and is not an image of this bottle.

## Export inspection

The actual `public/models/milk_bottle.glb` was freshly reimported, measured and
rendered offline. See [measurements.json](quality/measurements.json),
[front](quality/front.png), [side](quality/side.png),
[three-quarter](quality/threequarter.png) and [cap](quality/cap.png).

Checks passed: finite vertices, exactly one connected component, zero
non-manifold edges after export-seam welding, zero degenerate triangles,
positive signed volume, bottom contact, centered footprint and front orientation.
The file has no texture/image, external buffer URI, camera or light. The saved
Blend was reopened and its decompressed metadata checked for private-path
markers; PNG text and EXIF chunks were removed. Visual inspection found a clear
milk-bottle silhouette, legible cap band, continuous shoulder and base with no
floor gap, detached cap or dark overlapping surfaces. Polygonal cap edges are
intentional at this small prop budget.

These are local asset checks. Game loading, pickup/hiding, scene lighting,
label occlusion, failure fallback and the final normal-input run belong to
integration verification. The source and test files were not changed here.

## Reproduce and integrate

From the repository root, run:

```sh
blender --background --python scripts/build-milk-bottle.py
```

Blender 5.2.4 LTS and `zstd` are required. The script writes the canonical GLB,
editable Blend and four inspection PNGs, reimports the export and writes its
measurements. It never starts the game. The output profile and geometry are
deterministic; Blend serialization metadata may change file hashes between
runs. Refresh the shared ledger/manifest hashes if promoting a regenerated file.

Use the same `models/milk_bottle.glb` for both `milk1` and `milk2`, at scale 1.
Put the origin directly on the node's floor or fixture top; no half-height
offset is needed. The label anchor stays 0.32 m above that base. Hide the
instance after collection. Loader registration and placeholder fallback are
the implementation role's responsibility, per the growth Spec.
