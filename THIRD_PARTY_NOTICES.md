# Third-party notices

This file records runtime dependencies, generated 3D assets and free public source assets.
The Vite build includes this file as `dist/THIRD_PARTY_NOTICES.md`; retain it
when distributing the built application. This notice does not choose a license
for the project's own code.

Asset availability and game integration are separate stages. Consult
`assets/ledger.csv` and the active development branch for their current status.
The repository's MIT license does not replace the asset licenses below.

## Duck model — Meshy, CC BY 4.0

The source mesh in `assets/duck/gen/duck__meshy6lite_raw_v01.glb` was generated
with **Meshy 6 Lite** on 2026-11-20 from the project's original reference image.
Meshy licenses this free-plan output under
[Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/).
Attribution: **Meshy** — [service](https://www.meshy.ai/),
[applicable terms](https://www.meshy.ai/terms-of-use).

The editable Blender source and `public/models/duck.glb` are modified versions
of that mesh, distributed under the same CC BY 4.0 license. Codex used Blender
5.2.4 to reduce 90,266 triangles to 5,800, smooth normals, add yellow/orange/black
vertex colors and one PBR material, set a 0.30 m height with bottom-center origin
and +Z front/+Y up, and add hat and label sockets. The original reconstructed
shape was retained. Keep this attribution, license link, and modification notice
with redistributed copies. Meshy does not endorse this project.

Revision v02 (2026-11-21): localized smoothing of the original eye patches,
removal of irregular dark eye colors, and two matched smooth eye inserts.
The original body remains; the revised export has 7,720 triangles, one material,
no textures and unchanged overall bounds and sockets. The modified mesh and
its Blender-rendered previews remain CC BY 4.0.

Revision v03 (2026-11-21): measured source-head regularization, local torso
fairing with protected wing outlines, a clean baked body palette, and paired
glossy eyes. The runtime export has 7,296 triangles and two materials.
Original raw data and socket transforms are preserved. The new Blender scene,
textures and comparison renders also remain CC BY 4.0.

Revision v04 (2026-11-21): user-requested footless rubber duck. Legs and feet
are removed; the lower belly is faired into a rounded yellow underside with
a small flat contact area. Head, eyes, beak, upper wing detail, texture and
exact sockets are retained. The export has 7,214 triangles, two materials and
one embedded texture. Original raw data and earlier revisions are preserved;
the new Blender scene, GLB and derived previews remain CC BY 4.0.

The input reference was separately AI-generated with OpenAI through Codex;
the project releases its rights to that reference under MIT, to the extent
permitted by law. See `assets/duck/ref/README.md` and `assets/ledger.csv` for
provenance and file checksums. No claim of exclusively human authorship is made.

## Duck sauna hat — Meshy, CC BY 4.0

The source mesh in
`assets/hat_sauna_duck/gen/hat_sauna_duck__meshy6lite_raw_v01.glb` was generated
with **Meshy 6 Lite** on 2026-11-20 from the project's original OpenAI-generated
hat reference. Attribution: **Meshy** — [service](https://www.meshy.ai/),
[applicable terms](https://www.meshy.ai/terms-of-use). The raw mesh, editable
Blender source, and modified `public/models/hat_sauna_duck.glb` are distributed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Codex used Blender 5.2.4 to reduce 96,572 triangles to 1,440, smooth normals,
add one pale aqua material, set an approximately 0.18 m base diameter and
0.14 m height, and place the origin at the inner-base center with +Y up.
The reconstructed shape and hollow underside were retained. Keep this
attribution, license link, and modification notice with redistributed copies.
Meshy does not endorse this project. Reference-image rights and exact output
checksums are recorded separately in `assets/hat_sauna_duck/ref/README.md`
and `assets/ledger.csv`.

Hat revision v02 (2026-11-21): uniform source scaling, retopology from measured
inner/outer profiles, and a hanging loop fitted to the source contour. The
2,064-triangle export has one matte material, no textures, and an open underside.
The natural source height replaces the earlier vertically compressed fit.

## Child and adult characters — Meshy, CC BY 4.0

The source meshes in `assets/child/gen/` and `assets/adult/gen/` were generated
with **Meshy 6 Lite** on 2026-11-20 from the project's original OpenAI-generated
character references. Attribution: **Meshy** — [service](https://www.meshy.ai/),
[applicable terms](https://www.meshy.ai/terms-of-use). The raw meshes, editable
Blender sources, and modified `public/models/child.glb` and
`public/models/adult.glb` are distributed under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Codex used Blender 5.2.4 to simplify the generated geometry, adjust proportions
and poses, create separate clothed and simplified bathing variants, paint and
bake embedded color textures, set metric scale and bottom-center origins with
+Z front/+Y up, and add hand, label, and adult carry sockets. The bathing
variants are stylized, featureless toy figures. They are modifications of the
generated meshes. See each asset's README
for exact changes, measurements, and limitations, and `assets/ledger.csv` for
the source-to-export checksums.

Human revisions v02 (2026-11-21): smooth source-based shoulder and arm/carry
pose corrections with protected legs, local facial-relief cleanup, continuous
facial/clothing color baking after source-coordinate reprojection, and balanced
reduction with detailed-source normals. Both opaque toy variants retain their
authored sockets. The new scenes, textures and diagnostic renders remain
CC BY 4.0. Earlier exports are preserved for reproducible comparison.

Human revisions v03 (2026-11-21): the Adult face UV region and color bake are
corrected; both humans receive a shared 13-bone skeleton and skin weights
for runtime walking. The original mesh geometry and two outfit triangle
counts are retained. The rigged exports and their editable Blender sources
remain CC BY 4.0. Distance-driven pose code is part of the MIT game code;
no third-party animation or paid service was introduced.

Keep this attribution, license link, and modification notice with redistributed
copies. Meshy does not endorse this project. The project releases its rights to
the separate input references under MIT, to the extent permitted by law; that
does not replace the CC BY 4.0 license on the generated and adjusted models.

## Bath stool and wash basin — Meshy, CC BY 4.0

The separate source meshes in `assets/bath_stool/gen/` and
`assets/wash_basin/gen/` were generated with **Meshy 6 Lite** on 2026-11-21,
from the project's original single-object references, with textures off.
Attribution: **Meshy** — [service](https://www.meshy.ai/),
[applicable terms](https://www.meshy.ai/terms-of-use).
The generated meshes, adjusted Blender sources, derived render previews and
`public/models/bath_stool.glb` / `public/models/wash_basin.glb` are distributed
under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

Codex used Blender 5.2.4 to measure the stool's generated surface, rebuild
supported quad contours, remove unwanted seat rings, regularize leg and arch
curvature, retain the drain and underside, and add one ivory material. The
basin was retopologized along measured cross-sections, preserving its natural
round proportions, rim, hollow interior and solid floor, with one yellow
material. Detailed editable masters are retained; runtime meshes concentrate
vertices at important curves and transfer normals from those clean masters.
Both exports use metric dimensions,
bottom-centered origins, +Y up, and no textures. Original generated meshes
are retained; see each asset's README and `assets/ledger.csv` for the exact
modifications and source-to-export checksums.

Keep this attribution, license link and modification notice with redistributed
copies. Meshy does not endorse this project. The separate reference images
have their own OpenAI-generation provenance and project MIT rights records;
those rights do not replace the CC BY 4.0 license on the generated models.

The four `bath_stool_lod_*` and `wash_basin_lod_*` exports and their editable
LOD scenes/render previews are source-derived modifications of those same
models and remain CC BY 4.0. They reduce geometry for distance rendering while
preserving the source dimensions, openings and materials; the original high
models are unchanged. See `assets/wash_station/quality/lod/README.md` for
the method, inspection conditions and exact source/output checksums.

## Background adults — Quaternius CC0 source, project MIT modifications

The current `npc_staff`, `npc_bath_standing`, `npc_seated` and their three
`_lod_far` exports use the male body, hair and eyebrow geometry from
[Quaternius Universal Base Characters Free Standard](https://quaternius.com/packs/universalbasecharacters),
licensed [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
The selected original glTF/BIN/textures and author license remain unchanged in
`assets/public_sources/quaternius_universal_base/`. Its source record identifies
the free edition and the actual redistribution ZIP/checksum; the paid Source
edition was not used.

Project changes include mature character proportions, distinct hairstyles and
colors, static reception/standing/seated poses, simplified non-anatomical bath
surfaces, clothing masks, protected face/hand reduction, and embedded texture
atlases. Project-held rights in these modifications are MIT; original sources
remain CC0. Detailed editable files and inspection records are in
`assets/sento_visitors/`. These NPCs do not reuse the playable father's geometry.
The separate `assets/sento_visitors/quality/father-and-distinct-visitors.png`
also depicts the Meshy-derived father and is a CC BY 4.0 comparison composite;
retain the Meshy credit and change notice in `assets/sento_visitors/ATTRIBUTION.md`.

The former Meshy/Adult-derived NPCs remain historical CC BY 4.0 assets in
`assets/sento_npcs/`, with the prior six exports and distribution notices in
`assets/sento_npcs/archive/pre-independent-v03/`. Their Meshy attribution,
license and modification notice still apply to those archived files and the
v01 environment export; they do not describe the new Quaternius NPCs.

## Free public environment sources — CC0

The refreshed environment uses selected geometry from **Kenney Furniture Kit
2.0** and **Nature Kit 2.1**. Source pages:
[constituent furniture](https://kenney.nl/assets/furniture-kit),
[nature](https://kenney.nl/assets/nature-kit).
The original author licenses these packs under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Selected originals, author license texts and exact checksums are retained in
`assets/public_sources/kenney_furniture/` and `kenney_nature/`.
The downloaded archives came from the explicitly identified CC0 redistribution
[WaviestSun/atelier-packs](https://github.com/WaviestSun/atelier-packs);
archive checksums match that redistributor's published manifest. This is not a
claim of byte comparison against a current author download. Selection is not
the same as use: the environment quality record lists actual geometry uses.
Instances are fitted to the existing map, given coherent matte materials,
and combined into material batches. Original source files are unchanged.

**Poly Haven**, creator **Charlotte Baglioni**, supplies the CC0
[Hinoki Planks](https://polyhaven.com/a/hinoki_planks) texture used by the wood
surfaces. The separate [Rounded Square Tiled Wall](https://polyhaven.com/a/rounded_square_tiled_wall)
source was retained for material exploration; retention does not imply runtime
use. Original diffuse, OpenGL normal and roughness JPEGs, API checksums and
[license terms](https://polyhaven.com/license) are recorded under
`assets/public_sources/polyhaven/`. Source texture files are unchanged;
Blender material scale and appearance adjustments are documented separately.

The mural and environment art-direction reference were separately generated
from original project prompts through OpenAI. Project-held output rights are
released under MIT to the extent permitted by law. See `assets/sento_mural/ref/`
and `assets/sento_environment/ref/`; original PNGs and provenance are retained.
The art-direction image is a reference, not a screenshot or a map.

The assembled `sento_environment.glb` is distributed as a CC BY 4.0 composite.

The tattooed standing visitor retains the independent Quaternius CC0 body,
with original koi/wave/peony art generated from a project prompt through the
built-in OpenAI image tool. Blender supplies the atlas and UV modifications.
Project-held art/modification rights are MIT to the extent permitted by law;
no playable-father geometry is used. The original prompt, image and detailed
credits are in `assets/sento_visitors/tattoo/`, and each new GLB has its own
`.LICENSE.txt` notice. The world composite retains its existing license.
Its current background NPCs use the independent Quaternius sources above;
independent CC0 and project MIT components retain their original licenses.
The previous Meshy-NPC composite and its notice remain preserved as v01.
See `public/models/sento_environment.LICENSE.txt` and the per-placement source
record in `assets/sento_environment/quality/measurements.json`.

## Small items — original work and Quaternius CC0 sources

`soap.glb` and `towel.glb` were authored in Blender for this project. The rounded
soap, folded cotton form, materials and project-held rights are MIT licensed.

`coin_500.glb` and `sauna_key.glb` use actual **Quaternius** Coin and Key1 sources
from the [Ultimate RPG Pack](https://quaternius.com/packs/ultimaterpg.html),
licensed [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).
Original OBJ, MTL and bundled license files are retained in
`assets/sento_small_items/source/`. The coin profile was resampled and fitted,
with a generic raised leaf decoration and two satin metal materials. The key
was fitted to the game's dimensions, its two-tooth notch cleaned, and its bow
chamfered. Project-held rights in these modifications are MIT; the unchanged
public sources remain CC0. Full records, checksums and inspections are in
`assets/sento_small_items/README.md`, `provenance.json` and `quality/`.
Keep the per-model license files when distributing the exports.

## Growth milk bottle — original project work

`milk_bottle.glb` is original Blender-authored geometry and materials, released
under the project MIT license. It includes no downloaded mesh, external texture
or Image-to-3D output. The existing original sento art-direction reference
informed its cream/blue palette; its earlier image provenance remains separate.
The editable Blend, build script, hashes, measurements and offline inspection
renders are recorded in `assets/milk_bottle/README.md` and `provenance.json`.
Keep `public/models/milk_bottle.LICENSE.txt` with distributed copies.

## three.js

- Installed version reviewed: 0.187.0
- Upstream: <https://github.com/mrdoob/three.js>
- License text below copied from the installed package's `LICENSE` file.

The MIT License

Copyright © 2010-2026 three.js authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## Development dependencies

The direct development dependencies reviewed are `@types/node`, `@types/three`, `fast-check`,
`vite`, and `vitest` (MIT), and `typescript` (Apache-2.0), according to their
installed package metadata. They are not shipped in the current runtime build.
Keep their package-provided notices if distributing those tools or their source.
Revisit this inventory when dependencies or bundled assets change.
