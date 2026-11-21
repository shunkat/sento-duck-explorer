# Assets

Final 3D assets for Sento Duck Explorer. The spec is in `.kiro/specs/final-assets/`.

**Baseline (2026-11-20):** Duck, sauna hat, Child and Adult have completed reference image → Meshy Free / Meshy 6 Lite → Blender adjustment → GLB export. The original images and generated meshes, editable Blender files, measurements, checksums, and CC BY 4.0 attribution are recorded. Both human GLBs include separate clothed/bath meshes with embedded textures; the renderer must show exactly one outfit. They are static meshes, without skeletal walking/carry/wiping animations. Reimported renders checked both outfits, hat fit, and the Adult's carry socket with the actual Duck and hat. These are asset checks, not full gameplay validation. See `ledger.csv` and `manifest.json` for each stage. This version connects the four models to shoulder-view gameplay; version-specific normal-input results are in `docs/shoulder-view-verification.md`. The environment kit and other props remain planned.

Blender 5.2.4 LTS is available for adjustment. Existing generated assets retain their image → Image to 3D → Blender → GLB provenance. On 2026-11-21 the user approved free public sources and direct Blender authoring for new buildings, environments, facilities and small props; actual source paths and licenses must be recorded. Installing tools or producing a reference image does not complete an asset. See `service-selection.md` for the selected service, usage limits, and asset licensing.

2026-11-21 finishing update: [Duck v02](duck/blend/duck__v02.md) corrects the eyes while retaining the source body and sockets. The [washing-station batch](wash_station/README.md) now includes separate Meshy 6 Lite outputs corrected in Blender and registered as five stools / five basins in the local branch, with original sources, reimported shape checks and CC BY 4.0 attribution. Independent review and in-game visual checks remain pending. Real play is deferred at the user's request.

## Pipeline per asset

1. Reference images (start with a clear three-quarter view; add front / side / back when needed) → `assets/<asset_id>/ref/`
2. Image to 3D, raw output kept as received → `assets/<asset_id>/gen/` (only if redistribution is allowed; otherwise `.private/assets/<asset_id>/`, which is gitignored)
3. Blender adjustment → `assets/<asset_id>/blend/<asset_id>__v<nn>.blend`
4. GLB export → `public/models/<asset_id>.glb` (the only files the game loads)
5. Game integration and checks

New environment/prop routes: selected free source → Blender → GLB, or original art direction → Blender authoring → GLB. Source archives, license texts, modifications and measured outputs are recorded in `public_sources/`, `sento_environment/` and `sento_small_items/`.

Exports: meters, +Y up, front +Z, origin at the bottom center of the footprint, embedded textures. The assembled environment instead retains identity-root world coordinates from LEVEL; its named visibility groups are an explicit exception.

## ledger.csv

One row per asset per stage (`prototype`, `source`, `reference`, `generated`, `blend`, `final`). Fill in every column when a stage is done:

- `file`: path relative to the repository. Never write personal or absolute paths.
- `creator` and `method`: who or what made it, and how (for example, the image method or the generation settings).
- `tool_or_service`, `tool_version`, `terms_url`: a public link to the terms that applied on `created_date`.
- `input_rights`, `output_license`, `redistributable` (`yes` / `no` / `unknown`), `commercial_use`, `attribution`.
- `parent_asset`: set when an asset is derived from another asset's generated model or `.blend` file (see the derived-asset rule below).
- `sha256`: checksum of the exact file (`shasum -a 256 <file>`).

Only assets whose `final` row has `redistributable = yes` may be placed in `public/models/`.

The repository is public under the MIT license. Every committed file becomes public, so check the redistribution rights **before** committing an asset file. The MIT license covers the project's own work. It does not by itself cover generated or third-party asset content; record each asset's own license.

Every final asset needs records matching its actual approved route. Existing generated models retain all four stages; new public-source models record `source`, `blend` and `final`, while directly authored models record their art reference, `blend` and `final`. Never invent an image-generation stage or unrelated parent to fill a template. A **derived generated** asset (cut from another asset's generated model or `.blend`) sets `parent_asset`. Its `reference` and `generated` rows point to the parent's existing files by path and `sha256` (notes: "inherited"). It has its own `blend` row (or the object name inside the parent `.blend`) and its own `final` row.

## manifest.json

The planned limits (size, triangles, textures, file size, sockets) for each asset. After exporting, record the measured bounding box, triangle count, and file size under `measured`. A planned test will compare them with the limits.

Do not put account details, private links, or credentials in any asset file, file name, or metadata.


2026-11-21 whole-environment update: all 18 runtime GLBs are connected, including
free-source/direct-authored world and small props plus source-derived washing
and NPC distance variants. See [environment release verification](../docs/environment-release-verification.md)
for fixed revisions, rights/metadata checks, actual rendering and limits.
Earlier uncompleted-environment statements above describe historical snapshots.
