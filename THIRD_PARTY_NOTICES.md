# Third-party notices

This file records runtime dependencies and generated 3D assets.
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
generated meshes; no skeletal animation is included. See each asset's README
for exact changes, measurements, and limitations, and `assets/ledger.csv` for
the source-to-export checksums.

Keep this attribution, license link, and modification notice with redistributed
copies. Meshy does not endorse this project. The project releases its rights to
the separate input references under MIT, to the extent permitted by law; that
does not replace the CC BY 4.0 license on the generated and adjusted models.

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
