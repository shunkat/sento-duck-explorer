# Requirements Document

## Introduction

This spec covers the final 3D assets of Sento Duck Explorer and their integration into the game built in `prototype-core-gameplay`. It turns the mandatory production pipeline in `KIRO_HANDOFF.md` into checkable requirements:

**reference image → Image to 3D → Blender adjustment → glTF (GLB) export → game integration**

The pipeline is confirmed by the user and must not be skipped. Placeholder primitives or Blender scripts alone do not complete this spec.

### Status at creation (2026-11-20)

- **No real production has been done.** No reference image, no Image to 3D generation, no Blender file, and no GLB exists yet.
- **No Image to 3D service is selected.** Meshy is a candidate named in `KIRO_HANDOFF.md`. No account, contract, payment, upload, or generation was made for this spec.
- **How the reference images are made is not decided** (`KIRO_HANDOFF.md`: 画像をどう作るかは未指定).
- **Repository and code license:** the project is a public GitHub repository under the MIT license (`LICENSE`), with `origin/main`. An hourly Kiro Web task is active, as recorded by Codex.
- **Asset rights are a separate question.** The MIT license covers the project's own code and files. It does not settle the rights of reference images, Image to 3D outputs, or other third-party material, which are unchecked because none exist yet. Each asset needs its own ledger record (Requirement 7) before it enters the public repository.

### Decision status

- **[User-confirmed game content]**, decided by the user in `KIRO_HANDOFF.md`:
  - the three characters, the 10-step route, the goal, and F1–F7;
  - the mandatory pipeline for final models (image → Image to 3D → Blender adjustment → game integration), which must not be skipped;
  - the production order: prototype → Duck, hat, and one bath section to fix the art style → humans and facilities in the same style.
- **[User chose to consider]**: Adult accompanies Child, and Child alone passes the crowd gaps (`KIRO_HANDOFF.md`, 2026-11-20). The user said they would consider this. They did not confirm the mechanism.
- **[Provisional, from existing steering and specs]**: implementation designs that Kiro adopted per `.kiro/steering/project-autonomy.md` and the `prototype-core-gameplay` spec. They are not user decisions and can change:
  - pair doors (the companion follows within 3 m, Child waits with Adult on the payment trip and on the way to the pond) and the Duck carriers (Child before the hat, to the coin channel; Adult after it, to the pond);
  - visual models kept separate from collision, items, and progress state;
  - hat, towel, key, soap, and coin as separate models, and the hat not merged into Duck. `KIRO_HANDOFF.md` lists these as recommended design proposals (制作を支える設計案), not as user decisions;
  - every number in this spec. The reason for each value is in design.md.
- **[Proposal]**: an idea for the user to decide. The Costume Contest presentation ("night sento, a small steam spirit and lanterns that show the way and the dangers") comes from `docs/kiroween-review.md`. The user has **not** adopted it, and it does not change the game content above.

## Glossary

- **Asset**: one model that ships in the game (e.g. `duck`, `hat_sauna_duck`, `bath_wall_2m`).
- **AssetID**: a stable lower_snake_case name used in every file name and ledger row of that asset.
- **ReferenceImage**: the image(s) that define an asset's shape, color, and texture (front, side, back, and optionally 3/4 view).
- **GeneratedModel**: the raw output of the Image to 3D service, kept as received.
- **BlendFile**: the Blender file in which the GeneratedModel is adjusted.
- **FinalGLB**: the binary glTF file exported from the BlendFile and loaded by the game.
- **AssetLedger**: the table recording, for each asset and stage, the file, method, tool or service, source, terms, rights, redistribution status, and checksum (`assets/ledger.csv`).
- **AssetManifest**: the machine-readable list of planned and measured asset dimensions and budgets (`assets/manifest.json`).
- **Collider**: the logic-side circle on the XZ plane used by `src/sim/collision.ts`. Radii: Duck 0.15 m, Child 0.25 m, Adult 0.35 m.
- **Socket**: a named empty node in a GLB that marks where another model attaches (`socket_hat`, `socket_carry`, `socket_hand_r`).
- **ModelAdapter**: the view-layer code that places FinalGLBs from the existing view model (`deriveView`) and falls back to primitives.
- **DuckView / Overview**: the low follow camera on Duck, and the whole-map camera toggled with C.

## Requirements

### Requirement 1: Mandatory production pipeline

**User Story:** As the creator, I want every final asset to go through image → Image to 3D → Blender → GLB → game, so that the final art follows the decided production method.

#### Acceptance Criteria

1. THE Project SHALL produce each FinalGLB in this spec by the pipeline ReferenceImage → GeneratedModel → BlendFile → FinalGLB → game integration. *(User-confirmed)*
2. IF an asset is derived from another asset instead of its own generation (for example, bath wall variants cut from one generated wall), THEN THE AssetLedger SHALL name the parent AssetID and SHALL trace the derived asset to the parent's existing `done` rows for the ReferenceImage, the GeneratedModel, and the BlendFile, by file and SHA-256. The derived asset inherits those stages. It SHALL have its own BlendFile (or a named object in the parent's BlendFile, recorded by name) and its own FinalGLB. *(Provisional: derivation is allowed; the user has not specified the scope.)*
3. THE Project SHALL NOT mark an asset `final` unless every pipeline stage is covered by a `done` ledger row that points to an existing file: its own ReferenceImage, GeneratedModel, BlendFile, and FinalGLB, or, for a derived asset, the inherited parent rows from criterion 2 plus its own BlendFile and FinalGLB rows.
4. THE AssetLedger SHALL NOT use "not applicable" or a similar note to skip the ReferenceImage, GeneratedModel, or BlendFile stage of a final asset. The only rows that may record "not applicable" are placeholder (`prototype`) rows, which are never final assets.
5. THE Project SHALL keep placeholder primitives in the game until the matching FinalGLB passes Requirement 9, and SHALL NOT describe the placeholder build as the finished work.

### Requirement 2: Production order

**User Story:** As the creator, I want to fix the art style on a small set first, so that later assets match it.

#### Acceptance Criteria

1. THE Project SHALL produce the stage-2 assets first, in this order: Duck, the duck sauna hat, then one bath section kit. *(User-confirmed order: Duck, hat, one bath section)*
2. THE stage-2 bath section SHALL cover the prototype `bath` zone and contain at least: the bath walls with the NarrowHole opening, the bathwater tub, the kakeyu spot, the soap, the 500-yen coin, and the door frame to the changing room. *(Provisional scope)*
3. WHEN the stage-2 assets are integrated, THE Project SHALL record a style decision (palette, material look, edge treatment) in the design before starting stage-3 assets.
4. THE Project SHALL produce stage-3 assets (Child, Adult, towel, key, reception, changing room, sauna, open-air bath, pond) only in the recorded style. *(User-confirmed: same style for humans and facilities)*

### Requirement 3: Character dimensions and collider compatibility

**User Story:** As a player, I want the final characters to look like they fit where the game lets them go, so that the size rules stay understandable.

#### Acceptance Criteria

1. THE Project SHALL keep the logic colliders unchanged when models are replaced: Duck 0.15 m, Child 0.25 m, Adult 0.35 m radius, NarrowHole 0.40 m, CrowdGap 0.60 m, door 1.20 m.
2. THE Duck FinalGLB SHALL have a height of 0.28–0.32 m and a maximum horizontal width (wings and tail included) of at most 0.36 m, so that it visibly fits the 0.40 m NarrowHole.
3. THE Child FinalGLB SHALL have a height of 1.15–1.25 m and a shoulder width of 0.44–0.56 m, so that it visibly fits a 0.60 m CrowdGap and visibly does not fit the 0.40 m NarrowHole.
4. THE Adult FinalGLB SHALL have a height of 1.65–1.75 m and a shoulder width of 0.64–0.80 m, so that it visibly does not fit a 0.60 m CrowdGap.
5. THE Project SHALL export every FinalGLB in meters, +Y up, front facing +Z (glTF convention), with the origin at the bottom center of the footprint.
6. WHEN a FinalGLB is exported, THE AssetManifest SHALL record its measured bounding box, and an automated check SHALL compare the measured values with criteria 2–4.

### Requirement 4: Attachment points: hat, carrying, held items

**User Story:** As a player, I want the hat to sit on Duck's head and Duck to sit in Adult's arms, so that the item and carry states are clear.

#### Acceptance Criteria

1. THE Duck FinalGLB SHALL contain a `socket_hat` node on the top of the head. The hat SHALL be a separate FinalGLB attached to that socket only while the hat status is `equipped`. *(Provisional, from the design proposals in `KIRO_HANDOFF.md`)*
2. THE hat FinalGLB SHALL have its origin at the center of its inner base, and SHALL fit Duck's head: base diameter 0.16–0.22 m, height 0.12–0.18 m.
3. THE Adult FinalGLB SHALL contain a `socket_carry` node in front of the chest. The carried Duck's root (its bottom-center origin) SHALL be attached to this socket, which sits at 0.90 m above Adult's feet. The carried Duck's center is then at 0.90 + 0.15 = 1.05 m, the same as the prototype. The logic rule that the carried Duck's position equals Adult's position does not change.
4. THE Child and Adult FinalGLBs SHALL contain a `socket_hand_r` node where held items (coin, key, hat before equipping) are drawn.
5. WHEN the hat is equipped, the carried state changes, or a checkpoint is restored, THE ModelAdapter SHALL show the hat, the carried Duck, and held items exactly as `deriveView` reports them.

### Requirement 5: Budgets

**User Story:** As a player opening the demo URL, I want the game to load quickly and run smoothly in a browser.

#### Acceptance Criteria

1. THE Project SHALL keep each FinalGLB within its triangle, texture, material, and file-size budget in the design's budget table. *(Provisional values)*
2. THE stage-2 scene (all three characters, the bath section, items) SHALL stay within 60,000 triangles drawn and 120 draw calls.
3. THE game SHALL load the stage-2 assets with at most 12 MB of model and texture downloads, and the full final asset set with at most 30 MB.
4. WHILE the stage-2 scene is shown at 1280 × 720, THE game SHALL target 60 frames per second on the reference test machine named in the progress record.
5. IF a FinalGLB exceeds its budget, THEN THE Project SHALL reduce it in Blender (decimation, texture resizing, merging materials) before integration, or record an approved exception in the design.

### Requirement 6: File correspondence and storage

**User Story:** As a reviewer, I want to trace each in-game model back to its source image and generation, so that the production evidence and rights are checkable.

#### Acceptance Criteria

1. THE Project SHALL name every file of an asset with its AssetID and stage, following the layout in the design.
2. THE AssetLedger SHALL contain one row per asset per stage (reference, generated, blend, final) with the file path relative to the repository, SHA-256 checksum, creation date, creator (person or tool), and method.
3. THE game SHALL load FinalGLBs only from `public/models/`, and each loaded file SHALL have a matching `final` ledger row.
4. IF a GeneratedModel or ReferenceImage may not be redistributed publicly, THEN THE Project SHALL keep it out of the public repository, store only its checksum and description in the AssetLedger, and record where the private copy is kept without exposing a personal path.

### Requirement 7: Sources, terms, and redistribution

**User Story:** As the submitter, I want the rights of every asset recorded, so that the public repository and the hackathon submission do not break third-party terms.

#### Acceptance Criteria

1. THE AssetLedger SHALL record for every row: the source (self-made, tool output, third-party), the service or tool name and version, a public link to the terms that apply, the rights of the input image, the license of the output, whether public redistribution is allowed (`yes` / `no` / `unknown`), whether commercial use is allowed, and the attribution required.
2. THE Project SHALL NOT integrate an asset whose redistribution status is `unknown` or `no` into the public build.
3. WHEN an Image to 3D service is selected, THE Project SHALL record in the design the checked terms for: ownership and license of outputs, use in a public open-source repository, commercial use, upload privacy and training use of input images, and any plan or credit requirement. No paid plan is assumed.
4. THE ReferenceImages SHALL NOT copy existing characters, logos, real facilities, or real people.
5. THE Project SHALL add a notice for third-party assets to `THIRD_PARTY_NOTICES.md` before release.
6. THE Project SHALL NOT treat the repository's MIT license as covering an asset unless the asset's ledger rows show that the project holds the rights to release it under MIT. Otherwise the asset's own license and attribution are recorded and shown separately.

### Requirement 8: Readability in Duck's low view and in the overview

**User Story:** As a player, I want to recognise characters, items, openings, and hazards both from Duck's low camera and from the overview.

#### Acceptance Criteria

1. WHILE the DuckView is active at the NarrowHole approach, THE NarrowHole entrance SHALL be visible on screen and distinguishable from the wall (contrast of the opening rim against the wall).
2. WHILE the Overview is active at 1280 × 720, THE three characters SHALL be distinguishable from each other by silhouette and color without reading their labels.
3. THE Duck and hat SHALL contrast with the bathwater and the pond (Duck saturated yellow, hat red, water desaturated blue-green). *(Provisional palette rule)*
4. THE soap, coin, key, and hat SHALL each be distinguishable from the floor in both cameras.
5. THE existing label sizing (12–22 px, active character's label hidden) SHALL stay in force after the models are replaced.

### Requirement 9: Game rules are preserved after model replacement

**User Story:** As a player, I want the same game after the art is replaced, so that the cooperative route and manners lessons stay intact.

#### Acceptance Criteria

1. THE ModelAdapter SHALL change only the view layer. Logic modules (`src/core`, `src/sim`, `src/level`) SHALL NOT read model data.
2. WHEN models are replaced, THE existing automated tests (full-route test, F1–F7, pair doors, checkpoints, input, view) SHALL pass without changing their expectations.
3. WHEN models are replaced, THE accompaniment SHALL behave as before: Child is never left alone in the bath (the user chose to consider Adult accompanying Child), implemented by the provisional pair doors (Adult and Child cross together).
4. IF a FinalGLB fails to load, THEN THE game SHALL show the placeholder primitive for that asset and remain playable.
5. WHEN each stage is integrated, THE Project SHALL run a browser playthrough of the full route including F1–F7 screens and restart, and SHALL record who performed it (Kiro, Codex, or the user). Automated tests alone do not satisfy this criterion.
6. THE visual models SHALL NOT show any towel touching or entering the bathwater, so that the art never contradicts F1 (towel in the bath).

### Requirement 10: Costume Contest presentation (proposal)

**User Story:** As the creator, I want a gentle spooky presentation that helps the player, so that the game fits the Costume Contest idea without changing the rules.

#### Acceptance Criteria

1. THE Project SHALL treat the night-sento presentation (steam spirit, lanterns, pond light) as a proposal until the user adopts it, and SHALL NOT record it as a user decision. *(Proposal)*
2. IF the presentation is adopted, THEN each effect SHALL be tied to existing game information (objective, wetness, pair distance, soap, sauna quiet rule, crowd gaps, pond current, game-over reason), and SHALL NOT add new failure conditions or change F1–F7, the route, or checkpoint behavior.
3. IF the presentation is adopted, THEN it SHALL avoid jump scares, gore, and sudden loud sounds, and SHALL offer a setting that reduces motion and light effects.
4. THE effects SHALL be built separately from the model pipeline (shader, particles, lights), as `KIRO_HANDOFF.md` proposes for steam and water effects.

### Requirement 11: Records

**User Story:** As a reviewer, I want an accurate record of who did what, so that the Kiro usage and the remaining work are clear.

#### Acceptance Criteria

1. THE progress record SHALL list, for each stage, what Kiro did, what Codex verified, and what the user decided or checked, without merging them.
2. THE progress record SHALL NOT state that a stage is produced, verified, or adopted unless it was.
3. THE new documents SHALL NOT contain local absolute paths, personal links, account details, or credentials. `python3 scripts/check-publication.py` SHALL pass before and after each change.
