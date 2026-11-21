# Selected public environment sources

This is a small, inspected selection of **19 original Kenney GLBs and six original 1K Poly Haven texture maps**, all CC0. Originals are unchanged. No purchase, registration or paid tier was used. Current provenance, file hashes, exact archive paths, bounds and triangle counts are in [inventory.json](inventory.json), the package `source.json` files and [SHA256SUMS](SHA256SUMS).

## Kenney geometry

[Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit) and [Nature Kit](https://kenney.nl/assets/nature-kit) identify their assets as CC0. Their original `License.txt` files are retained beside the selected models. The downloaded bundles report Furniture 2.0 and Nature 2.1. The historical author ZIP links redirected to asset pages and did not return archives through that HTTP path. The actual files were obtained from the identified [CC0 redistribution](https://github.com/WaviestSun/atelier-packs), with both archive hashes matching its published manifest. This does not claim a direct byte comparison with a current author-hosted download.

| Source directory | Selected original models | Triangles |
|---|---|---:|
| `kenney_furniture/models/` | bathroomCabinet, bathroomMirror, bathroomSink, bench, bookcaseOpenLow, coatRack, plantSmall1, plantSmall2, pottedPlant | 60–316 each |
| `kenney_nature/models/` | fence_planks, fence_simpleHigh, plant_bushDetailed, plant_bushLarge, plant_flatTall, rock_largeA, rock_largeC, rock_largeE, rock_smallH, rock_smallI | 32–104 each |

The actual GLBs were imported into Blender 5.2.4 and inspected in [furniture](quality/kenney_furniture-source-review.png) and [nature](quality/kenney_nature-source-review.png) contact sheets. These previews normalize each object independently for comparison; they do not show correct relative world scale. [Measurements](quality/model-measurements.json) include node transforms and actual triangles. All positions were finite. The originals use material colors without external textures, so no associated image file is missing.

**Preferred starting points:** the bench, open low bookcase, coat rack, detailed bush and the later round-rock silhouettes offer recognizable shapes with modest geometry. Add the approved material palette, suitable bevels/normals and exact placement dimensions during integration. The source Nature materials use orange/teal colors and often metallic=1; these need replacement with matte stone/leaf/wood materials. `plant_bushLarge` can read as an open bowl, and `plant_flatTall` exposes dark leaf backs. They are conditional references, not approved ready-to-place plants. The domestic pedestal sink is useful for ceramic/faucet components, not a finished Japanese wash station.

The kits do not contain the requested soap, towel, coin, key or sento locker. Those are not claimed as reused public models.

## Poly Haven textures

Both selected textures are by **Charlotte Baglioni** and downloaded from Poly Haven's official public file service. [Poly Haven's license](https://polyhaven.com/license) permits use and redistribution under CC0. The [CC0 legal code copy](polyhaven/LICENSE-CC0-1.0.txt) was obtained from Creative Commons. Source records retain the official URLs, author, SHA-256, API checksum match and native surface scale.

- [Hinoki Planks](https://polyhaven.com/a/hinoki_planks): `polyhaven/hinoki_planks/`. The warm wood grain and knots suit sauna panels, benches and wooden trim. The original surface covers about 1.89 meters square.
- [Rounded Square Tiled Wall](https://polyhaven.com/a/rounded_square_tiled_wall): `polyhaven/rounded_square_tiled_wall/`. This is a small beige mosaic with visible aged grout. Prefer secondary wet surfaces or restrained detail use; it should not automatically replace the clean large-tile look of the style reference. The original surface covers about 2 meters square.

Each set contains its original diffuse, OpenGL normal and roughness JPEG at 1024×1024. All six maps together are 3,333,008 bytes. Use diffuse as sRGB and normal/roughness as non-color data; avoid excessive normal strength. The actual downloaded albedos were visually inspected. These source files are not an assertion that a final exported game material, placement or scene performance has passed review.

## Round-rock supplement

The original `rock_largeA/C/E` choices were rejected for tall onsen rock rows: stacking their flat profiles produced pancake-like piles. They remain unmodified source references only. The same downloaded Nature archive supplies two round, single-boulder alternatives, inspected in [this additional actual-GLB render](quality/kenney_nature-round-rock-review.png).

| File in `kenney_nature/models/` | Triangles | Native XYZ bounds size | Height / max horizontal extent | Intended use |
|---|---:|---|---:|---|
| `rock_smallH.glb` | 60 | 0.461824 × 0.407392 × 0.461824 | 0.882 | Fuller primary boulder |
| `rock_smallI.glb` | 44 | 0.358331 × 0.277816 × 0.413765 | 0.671 | Lower irregular accent |

Use one layer of separate rounded boulders, with rotation and modest uniform scale variation. At maximum horizontal span 1 meter, the H shape reaches about 0.882 meters high, so it does not promise an exact 1-meter top while remaining inside that footprint. Exact collider fit remains the world builder's job. Native palette/metallic correction is still required. No new service or download was used for this supplement.
