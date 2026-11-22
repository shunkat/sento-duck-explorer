# Assets and licenses

Inventory of code, dependencies and assets. Last checked against the repository contents on 2026-11-20. Update it whenever dependencies or assets change.

## Current inventory

| Item | Source | License | Notes |
| --- | --- | --- | --- |
| Game code (`src/`, `tests/`, `scripts/`, docs) | This repository | MIT (`LICENSE`) | MIT adopted with the owner's permission on 2026-11-20. |
| three.js 0.187.0 (runtime dependency) | <https://github.com/mrdoob/three.js> | MIT | Notice in `THIRD_PARTY_NOTICES.md`, copied into `dist/` by the build. |
| Development dependencies: `@types/node`, `@types/three`, `fast-check`, `vite`, `vitest` | npm | MIT | Not shipped in the runtime build. Recorded in `THIRD_PARTY_NOTICES.md`. |
| Development dependency: `typescript` | npm | Apache-2.0 | Not shipped in the runtime build. |

## Images and 3D assets

The runtime loads four GLBs from `public/models/`: Duck, Child, Adult and the sauna hat. Each has a final-stage ledger row, a recorded hash, an attribution sidecar and a matching source history. The project records original OpenAI-generated reference images separately from Meshy-generated meshes and Blender modifications.

| Material | Recorded license / status | Evidence |
| --- | --- | --- |
| Project rights in original reference PNGs | MIT; subject to applicable output rights | Per-asset reference README and ledger |
| Meshy Free / Meshy 6 Lite raw models | CC BY 4.0, redistributable according to the recorded service review | `assets/service-selection.md`, per-asset attribution and ledger |
| Blender-adjusted models and game GLBs | CC BY 4.0, with modifications identified | `.blend` sources, `public/models/*.LICENSE.txt`, `THIRD_PARTY_NOTICES.md` |
| Provisional level geometry, towel and remaining small props | Code-generated placeholders, not completed final assets | `src/view/scene.ts` |
| Box GLB under `tests/fixtures/` | Locally generated test fixture, not a final asset or runtime model | `scripts/make-test-glb.mjs` |
| Growth milk bottle (2026-11-22) | Original Blender-authored geometry and materials, MIT; exported asset ready for integration | `assets/milk_bottle/README.md`, provenance, manifest/ledger and `public/models/milk_bottle.LICENSE.txt` |

Human models contain embedded textures and two outfit variants; no shared skeleton or skeletal animations are claimed. No audio or custom font asset is listed in the current inventory. The [ledger](../assets/ledger.csv) and [manifest](../assets/manifest.json) are the detailed file/measurement records. Code MIT does not replace the models' separate CC BY 4.0 terms.

## Checks for future assets

- Keep the reference → generated → Blender → final lineage, hashes, creator and actual modifications.
- Record input-image rights, service/plan terms, redistribution permission and attribution before including an asset in a public build. The initial Meshy free workflow is authorized; new payments are not.
- Include attribution and license notices with distributed files; update this inventory and the English draft.
- Inspect binary metadata and provenance separately from the publication scanner, which cannot establish asset rights.

The 2026-11-20 integration reads the existing provenance records and verifies file hashes through the automated asset tests; it does not claim a fresh legal review of service terms.
