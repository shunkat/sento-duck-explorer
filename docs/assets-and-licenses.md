# Assets and licenses

Inventory of code, dependencies and assets. Last checked against the repository contents on 2026-11-20. Update it whenever dependencies or assets change.

## Current inventory

| Item | Source | License | Notes |
| --- | --- | --- | --- |
| Game code (`src/`, `tests/`, `scripts/`, docs) | This repository | MIT (`LICENSE`) | MIT adopted with the owner's permission on 2026-11-20. |
| three.js 0.187.0 (runtime dependency) | <https://github.com/mrdoob/three.js> | MIT | Notice in `THIRD_PARTY_NOTICES.md`, copied into `dist/` by the build. |
| Development dependencies: `@types/node`, `@types/three`, `fast-check`, `vite`, `vitest` | npm | MIT | Not shipped in the runtime build. Recorded in `THIRD_PARTY_NOTICES.md`. |
| Development dependency: `typescript` | npm | Apache-2.0 | Not shipped in the runtime build. |

## External models, images and audio

None are integrated. This was checked by listing the tracked files (`git ls-files`) for image, 3D model, audio, font and Blender extensions (png, jpg, gif, svg, webp, glb, gltf, obj, fbx, blend, mp3, wav, ogg, woff, ttf) and finding none. The source and `index.html` also contain no texture, glTF or audio loader and no asset imports.

All characters and scenery are generated in code as procedural primitive geometry (Three.js box, sphere, capsule, cone, cylinder and ring geometries). Colors and on-screen text are written in the source and are part of the MIT-licensed code.

## Checklist before adding final assets

Not done yet. Complete it for every asset before it is added to the repository.

- [ ] Source image: who made it, and does the project have the right to use it as input to an Image to 3D service and to publish the result? Keep the original file or a record of it.
- [ ] Image to 3D service: has one been chosen (none is decided; no paid plan is agreed)? Read its terms for ownership of outputs, commercial and public use, redistribution of the generated files inside an open-source repository, and any attribution requirement. Record the terms version and date.
- [ ] Blender files (`.blend`) and exported glTF: keep them linked to their source image and generated model, and confirm they may be redistributed under the repository license or note the separate license that applies.
- [ ] Any texture, audio, font or other third-party asset: record source URL, author, license, attribution text and redistribution permission in `THIRD_PARTY_NOTICES.md`.
- [ ] Consistency with the English submission text (`docs/submission-en.md`) and the Devpost entry.
- [ ] Re-run `python3 scripts/check-publication.py`. It does not audit asset rights or image metadata, so those need a manual check.
