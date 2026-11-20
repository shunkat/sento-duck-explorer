# Assets

Final 3D assets for Sento Duck Explorer. The spec is in `.kiro/specs/final-assets/`.

**Current state (2026-11-20):** the duck and sauna hat have completed reference image → Meshy Free / Meshy 6 Lite → Blender adjustment → GLB export. The original images and generated meshes, editable Blender files, measurements, checksums, and CC BY 4.0 attribution are recorded. The two exported models were reimported and rendered together to check hat fit; this is not a gameplay test. See `ledger.csv` and `manifest.json` for each stage. The main game still uses placeholder primitives; Crew is implementing the required third-person over-the-shoulder view and model integration on its development branch. Human characters and the bath kit are later production stages.

Blender 5.2.4 LTS is available for adjustment. The required image → Image to 3D → Blender → GLB sequence remains mandatory; installing tools or producing a reference image does not complete it. See `service-selection.md` for the selected service, usage limits, and asset licensing.

## Pipeline per asset

1. Reference images (start with a clear three-quarter view; add front / side / back when needed) → `assets/<asset_id>/ref/`
2. Image to 3D, raw output kept as received → `assets/<asset_id>/gen/` (only if redistribution is allowed; otherwise `.private/assets/<asset_id>/`, which is gitignored)
3. Blender adjustment → `assets/<asset_id>/blend/<asset_id>__v<nn>.blend`
4. GLB export → `public/models/<asset_id>.glb` (the only files the game loads)
5. Game integration and checks

Exports: meters, +Y up, front +Z, origin at the bottom center of the footprint, embedded textures.

## ledger.csv

One row per asset per stage (`prototype`, `reference`, `generated`, `blend`, `final`). Fill in every column when a stage is done:

- `file`: path relative to the repository. Never write personal or absolute paths.
- `creator` and `method`: who or what made it, and how (for example, the image method or the generation settings).
- `tool_or_service`, `tool_version`, `terms_url`: a public link to the terms that applied on `created_date`.
- `input_rights`, `output_license`, `redistributable` (`yes` / `no` / `unknown`), `commercial_use`, `attribution`.
- `parent_asset`: set when an asset is derived from another asset's generated model or `.blend` file (see the derived-asset rule below).
- `sha256`: checksum of the exact file (`shasum -a 256 <file>`).

Only assets whose `final` row has `redistributable = yes` may be placed in `public/models/`.

The repository is public under the MIT license. Every committed file becomes public, so check the redistribution rights **before** committing an asset file. The MIT license covers the project's own work. It does not by itself cover generated or third-party asset content; record each asset's own license.

Every final asset needs `done` rows for all four stages. A row may not say "not applicable" to skip a stage. A **derived** asset (cut from another asset's generated model or `.blend`) sets `parent_asset`. Its `reference` and `generated` rows point to the parent's existing files by path and `sha256` (notes: "inherited"). It has its own `blend` row (or the object name inside the parent `.blend`) and its own `final` row.

## manifest.json

The planned limits (size, triangles, textures, file size, sockets) for each asset. After exporting, record the measured bounding box, triangle count, and file size under `measured`. A planned test will compare them with the limits.

Do not put account details, private links, or credentials in any asset file, file name, or metadata.
