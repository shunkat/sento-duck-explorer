# Small bathhouse props

## Current local soap revision — 2026-11-23

The local runtime uses the supplied `v02-handoff` soap: 284 triangles, 222 exported
vertices, two materials, no textures and 8,928 bytes. Its 0.30 × 0.08 × 0.18 m
frame and bottom-center origin are unchanged; LEVEL retains the separate 0.15 m
slip radius. The shallow oval mark and warmer two-material finish are supplied
project Blender work. The exact GLB, rather than a re-export, is retained.

[Integration record](quality/soap-v02/integration.json) and
[ongoing rollout plan](../../docs/blender-asset-rollout.md) distinguish automated
checks from pending visual/normal-input acceptance. The supplied package did not
contain the v02 editable Blender file or authoring script. The v01 Blend below
is **not** its editable source. An [editable reimport](blend/soap__v02_reimport.blend)
now retains the actual v02 mesh and materials, saved and reopened in Blender
5.2.4 LTS with identical geometry, topology, normals and material parameters.
The [audit](quality/soap-v02/editable-source-audit.json) and
[reimport script](../../scripts/save-soap-handoff-blend.py) distinguish this
from recovery of the missing original construction history. The runtime GLB
has not been re-exported. Final game-view acceptance is still pending.
The supplied generator metadata identifies Khronos
glTF Blender I/O v4.3.47, not an independently confirmed Blender application build.

The prior runtime is archived unchanged as [soap v01](blend/soap__v01.glb).
All v01 measurements, source files and renders below are historical; the towel,
coin and key exports are unchanged. Coin and key remain retired from runtime.

## Historical small bathhouse props v01

Four final-size candidates are built in Blender 5.2.4 LTS for the cream, muted
fabric and warm-metal palette in the [environment style reference](../sento_environment/ref/README.md).
The coin and key use actual retained free public models. The soap and towel are
authored for this project. [Open the inspection gallery](quality/index.html) and
[export/reimport measurements](quality/measurements.json).

| Asset | glTF dimensions X × Y × Z (m) | Triangles | Materials | Bytes |
| --- | --- | ---: | ---: | ---: |
| Soap | 0.30 × 0.08 × 0.18 | 236 | 1 | 5,612 |
| Folded towel | 0.26 × 0.04 × 0.18 | 296 | 2 | 8,536 |
| 500-value coin | 0.20 × 0.03 × 0.20 | 608 | 2 | 16,264 |
| Sauna key | 0.18 × 0.04 × 0.08 | 468 | 1 | 21,348 |

The four files total 51,760 bytes. With two displayed towels the allocation is
**1,904 triangles**. This is 104 triangles above the nominal 1,800 target to keep
the coin contour, identifying leaf relief and key-head chamfer. It does not
increase the whole-scene 60,000-triangle limit; integration must fit the scene
allocation around these actual counts.

## Public source selection and rights

[Quaternius Ultimate RPG Pack](https://quaternius.com/packs/ultimaterpg.html)
provides the actual `Coin.obj` and `Key1.obj` under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The official
download's [original license](source/Quaternius-License.txt), both unmodified
OBJs and their original MTLs are retained in `source/`. Their checksums and the
selection record are in [provenance.json](provenance.json). Source geometry is
also retained unchanged in each corresponding editable Blend, separate from
the adjusted runtime object. The original source Blends were examined privately;
the reproducible public input is the original OBJ, not a modified substitute.

The other three downloaded Quaternius key designs were more ornamental and less
appropriate for a simple bathhouse key. `Key1` already supplied a legible bow,
collar, shaft and bit. The source coin supplied an editable ten-section raised
rim. These were useful starting shapes and were actually used in the outputs.

The parallel source inventory found no matching soap, folded towel, coin or key
in the downloaded [Kenney Furniture Kit](https://kenney.nl/assets/furniture-kit)
and Nature Kit. Kenney's [official terms](https://kenney.nl/support) identify its
asset-page downloads as CC0. The direct-authoring permission is used for the
two missing bath props rather than fitting unrelated furniture to them. No paid
pack, paid generation, account upgrade or external image texture was used.

Quaternius retains credit for the original CC0 models; CC0 does not require
attribution. Project-authored soap/towel geometry, further modifications and
the build code are distributed under the repository [MIT license](../../LICENSE).
The original public inputs remain CC0. These assets have no Meshy provenance;
the separate Meshy-derived stool, basin and character assets retain their own
licenses. No endorsement by Quaternius or Kenney is implied.

## Shape and material work

- **Soap:** six authored shoulder sections, true straight sides with circular
  corner arcs, a broad rounded cream bar and a stable bottom contact face.
  Satin nonmetal roughness is 0.56. It has no logo or branded stamp.
- **Towel:** a shallow curved top grid, continuous back fold, three subtly
  pinched seam edges and visible hem bands at both ends. The closed shell has
  a flat bottom; body and hem use nonmetal roughness 0.96 and 1.0. The modest
  contour variation represents folded cloth without a dense cloth simulation.
- **Coin:** the actual source's ten radial sections are resampled from 20 to
  28 angular sectors. The deep platformer recess is reduced to a 1 mm raised
  rim and a narrower annulus. Silver-colored rim and pale-brass face have
  metallic values 0.85/0.78 and roughness 0.34/0.40. The two-leaf relief is a
  generic project-authored motif, not a reproduction of legal-tender artwork.
- **Key:** the actual `Key1` bow, collar and shaft are retained, fitted to the
  requested metric frame, with a real notch producing two teeth. A 0.85 mm
  chamfer catches light on the deliberately octagonal head. The brass material
  has metallic 0.78 and roughness 0.42; weighted normals keep planar surfaces
  readable. The source has three overlapping closed assemblies, retained as
  three components in a single runtime mesh.

## Corrections and checks

The first key Boolean operated on the source's overlapping ring/shaft/bit as
one solid and incorrectly kept a sliver in the notch. A ray test rejected it.
The winding hypothesis was checked and rejected: no component needed reversal.
Isolating the original bit for the Boolean, then joining the assemblies again,
preserved both teeth and produced an open notch. The original source files were
not changed. The initial coin relief had coincident top planes at the leaf/stem
junction; those were separated before accepting the rendered candidate.

Every actual exported GLB was freshly reimported, measured and rendered from
three-quarter, top, side and underside views. All vertices are finite. Every
closed component has zero non-manifold edges after export-seam welding and zero
degenerate faces. The key bow and tooth notch pass unobstructed downward rays.
Coin relief solids meet the coin body intentionally; the key retains its source
assembly intersections. This is a real-time surface model, not a claim of one
Boolean-unioned printable solid.

All four models have exact target bounds within 1 μm, bottom-center origins,
meters and +Y up. They export one mesh each, 1–2 PBR materials, zero textures,
embedded buffers and no external URI, light or camera. Inspection found no
remaining black overlap at the coin relief, no blocked key opening, and a
closed towel underside with hem materials on both sides.

The [towel attachment-size image](quality/towel/attachment-size.png) uses neutral
dimension proxies, not the game's characters. A centered wrapper translates
the bottom-origin model by −0.02 m before placement. Head contact gap measures
0 and the held orientation (90° about X) meets its contact plane within 0.03 μm.
This confirms local dimensions and centering; actual game rigs, transitions,
occlusion fading and displayed material response remain integration checks.

Each saved Blend was reopened and decompressed for metadata inspection. Raw
coin/key vertex positions and polygon order/winding match the original OBJ
exactly after Blender's ordinary float conversion. Private path/account markers
were absent. All 19 inspection PNGs have text and EXIF chunks removed. Local
asset checks do not replace independent asset review, GPU compilation, frame
rate measurement or the deferred normal-input playthrough.

## Reproduce and integrate

Run `blender --background --python scripts/build-sento-small-items.py` from the
repository root, with Blender 5.2.4 LTS and `zstd` available. The build checks the
retained OBJ hashes and writes editable Blends, inspection renders, measurements
and four candidates under `.local/environment-refresh/items/`:
`soap.glb`, `towel.glb`, `coin_500.glb`, and `sauna_key.glb`.

Source inspection thumbnails are separate records from the initial import and
use their original orientation; they are not matched-light before/after tests.
Canonical asset promotion, scene placement, shared ledger/manifest updates and
release verification are separate integration work. No canonical public model,
runtime source, shared ledger or manifest was edited by this asset build.
