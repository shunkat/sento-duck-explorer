# Implementation Plan

Scope: final assets through the mandatory pipeline (reference image → Image to 3D → Blender adjustment → GLB → game integration). Placeholder primitives stay until each final asset passes its checks. Continue work covered by the user's existing authorization; task 3 identifies concrete operations that require new approval. Ordinary method selection and local preparation do not wait for approval.

Created on 2026-11-20 by the main Kiro agent writing the files directly. The spec sub-agent was not used, because it had failed earlier in this project; `.kiro/steering/project-autonomy.md` allows this.

- [x] 1. Local preparation (no external services)
  - [x] 1.1 Write requirements, design, tasks, and progress for this spec
  - [x] 1.2 Create the asset ledger template `assets/ledger.csv`, the manifest `assets/manifest.json` with planned limits, and `assets/README.md`
    - _Requirements: 6.1, 6.2, 7.1_
  - [x] 1.3 Run `python3 scripts/check-publication.py` before and after
    - _Requirements: 11.3_

- [ ] 2. Preparation that can proceed now (no account, payment, or upload)
  - [ ] 2.1 Design brief and silhouette guide sheet for Duck, the hat, and the bath section kit: true-scale front, side, and back outlines, socket marks, palette (local SVG or a Blender script). Ledger rows `reference / in_progress`; a guide is not the finished reference image
    - _Requirements: 1.1, 3.2, 4.1, 4.2, 8.3_
  - [ ] 2.2 Survey the public terms, pricing, and documentation of Meshy and at least one alternative Image to 3D service. Answer the six questions in the design with links and dates; recommend one service with reasons
    - _Requirements: 7.3_
  - [ ] 2.3 If an image generator is considered for the reference images, survey its public terms the same way
    - _Requirements: 7.1, 7.4_
  - [ ] 2.4 Propose the asset license policy: which assets may be released under the repository's MIT license, and how assets with other terms are labelled. The project code is already MIT; asset rights are separate
    - _Requirements: 7.1, 7.5, 7.6_
  - [ ] 2.5 ModelAdapter (view layer only), tested with a locally made test GLB under `tests/fixtures/` (a fixture, never a final asset)
    - `src/view/models.ts`: GLB loading through the `three/addons` GLTFLoader, socket lookup, fallback to primitives on error
    - `GameScene`: use the model when it is loaded; root at `centerY − radius` (Duck) or `centerY − height / 2` (humans); facing from movement; hat, carry (Duck root on `socket_carry` at 0.90 m), and held-item parenting
    - Manifest bounds test (no WebGL); all existing tests unchanged; `npm run build`
    - _Requirements: 3.6, 4.3, 4.5, 9.1, 9.2, 9.4_

- [ ] 3. Select provisional methods and check authorization for concrete operations
  - [ ] 3.1 Adopt a suitable reference image method from the recommendation and record its reasons as a provisional decision. Local preparation and work within existing authorization can proceed; ask only before an external operation outside that authorization
  - [ ] 3.2 Select an Image to 3D service after the terms survey. Before creating or connecting an account, accepting terms, making a new payment, granting permissions, or uploading data not already authorized, request the specific required approval with the destination, data, and cost. No new payment is assumed
  - [ ] 3.3 Record the asset license policy from 2.4 as a provisional decision supported by the checked rights. Use the already approved MIT license for assets the project has rights to release under MIT. Ask only if the proposed release needs a license or commitment outside existing authorization; do not stop unrelated preparation
    - _Requirements: 7.2, 7.3, 7.6_

- [ ] 4. Duck (stage 2, first; after method selection and any required service authorization in task 3)
  - [ ] 4.1 Reference images (front, side, back) painted over the guide → `assets/duck/ref/`; ledger rows
  - [ ] 4.2 Image to 3D generation; keep the raw output; ledger row (public, or `.private/` if not redistributable)
  - [ ] 4.3 Blender: scale, origin at the bottom center, +Y up / +Z front, `socket_hat`, `socket_label`, decimate to ≤ 6,000 triangles, 1024² texture; save the `.blend`; ledger row
  - [ ] 4.4 Export `public/models/duck.glb`; record the checksum and measured bounds in the manifest; integrate through the ModelAdapter
    - _Requirements: 1.1, 3.2, 3.5, 4.1, 5.1, 6.1–6.3_

- [ ] 5. Hat (stage 2, second)
  - [ ] 5.1 Reference → generation → Blender (origin at the inner base, base diameter 0.16–0.22 m, ≤ 1,500 triangles) → `public/models/hat_sauna_duck.glb`; ledger and manifest
  - [ ] 5.2 Check the hat on and off the Duck in the game (equip, carry, checkpoint restore)
    - _Requirements: 4.1, 4.2, 4.5_

- [ ] 6. Bath section kit (stage 2, third)
  - [ ] 6.1 Reference → generation → Blender kit: walls, NarrowHole wall (clear 0.40–0.45 m), door frame, tub, kakeyu, soap, coin. Derived pieces have inherited `reference` and `generated` rows pointing to the parent's real files (design: Derivation)
  - [ ] 6.2 Place the kit on the existing layout coordinates; collision still comes from `src/level/layout.ts`
  - [ ] 6.3 Readability checks in the DuckView and the Overview (hole rim, items, Duck on water)
    - _Requirements: 1.2–1.4, 2.2, 3.1, 5.2, 8.1–8.5_

- [ ] 7. Stage-2 verification and style record
  - [ ] 7.1 Measure the stage-2 triangles, draw calls, and download size; name the reference machine in the progress record
  - [ ] 7.2 Browser playthrough of the full route with F1–F7 screens and restart; record who performed it
  - [ ] 7.3 Write the style record in the design (palette, roughness, edge softness, texel density)
    - _Requirements: 2.3, 5.2–5.4, 9.3, 9.5_

- [ ] 8. Stage 3: humans and facilities in the recorded style
  - [ ] 8.1 Child and Adult with a shared skeleton, `clothed` and `bath` body variants (abstract toy-figure body, no towel on the body), `socket_hand_r`, and Adult's `socket_carry`
  - [ ] 8.2 Towel (while its owner is in the bathwater, drawn on the head or on the tub edge, never in the water), key; reception, changing room, sauna and seated crowd (gaps kept at 0.60 m), open-air bath, pond
  - [ ] 8.3 Repeat the checks in tasks 2.5 and 7 for every replacement
    - _Requirements: 2.4, 3.3, 3.4, 4.3, 4.4, 9_

- [ ] 9. Costume Contest presentation (only if the user adopts the proposal)
  - [ ] 9.1 Pure `deriveCues(state, level)` and unit tests showing that cues never change outcomes
  - [ ] 9.2 Lanterns, steam spirit, pond light; "reduce effects" option
    - _Requirements: 10.1–10.4_

- [ ] 10. Release checks for assets (every commit of asset files is public)
  - [ ] 10.1 Every asset in `public/models/` has `redistributable = yes`, complete ledger rows, and a license that the recorded policy from 3.3 allows; third-party notices updated
  - [ ] 10.2 Review the GLB metadata and the ledger by hand before each commit (the scanner does not inspect binaries)
    - _Requirements: 6.3, 7.2, 7.5, 7.6, 11.3_
