# Environment refresh release checks

2026-11-21, Codex. The user authorized replacing all visual assets and publishing
the updated game, then explicitly approved direct Blender creation with free
public sources wherever suitable. Normal-input play remains deferred. Kiro's
existing game implementation and LEVEL remain the gameplay authority.

## Selected production batch

The full asset/integration revision is `4ec94c28cc7dbec2c5ca0787d474df8dafa740af`.
The final rendering correction is `3cdc0b38a763be26964e5bcbd1d889a11fc2d1ce`.
Subsequent release-record changes do not alter runtime code or model bytes.

18 registered GLBs total **8,746,400 bytes**. The six previously accepted hero,
hat and washing models are byte-identical to the previous production version,
including the footless rubber Duck. New material is documented in
[the world source record](../assets/sento_environment/README.md),
[small items](../assets/sento_small_items/README.md),
[public sources](../assets/public_sources/README.md) and
[NPC distance variants](../assets/sento_npcs/quality/distance-lod/README.md).

The world contains new rooms, ceilings, doors, storage, benches, bath fittings,
ceramics, mural, sauna, outdoor bath, rocks and planting at the existing layout
coordinates. Actual free sources include Kenney bench/rock/shrub geometry,
Charlotte Baglioni's Poly Haven Hinoki maps and Quaternius coin/key geometry.
Unmatched soap, towel and specialized architecture were authored in Blender.
Candidate sources that were only explored are distinguished from actual uses.
Original downloads/licenses and generation sources remain unchanged.

The world export has 7,996 architectural and 12,200 near-NPC triangles, 33 meshes,
17 materials, 11 embedded images and 6,328,656 bytes. It covers 111 existing
placements plus five additional assemblies. Actual exported triangles do not
intersect the interiors of the 11 checked holes/crowd gaps/doorways. The world
and distance selectors keep one NPC detail level per slot and preserve frames.

## Independent inspection and automated checks

Separate Codex reviewers inspected actual GLB reimport views, source lineage,
rights, metadata and the view-only code. These are not reported as Crew B or
normal-input execution. No required findings remain after the character-GLB
connection assertion was added to the scene-budget test.

- Full suite on the complete integrated asset batch: **276 tests / 26 files**
  passed. Initial obsolete item-registry expectations and an incomplete
  renderer-free test harness were corrected; no production behavior was
  changed to accommodate those fixtures.
- The later reflection-light and connection-assertion correction passed its
  **19 affected tests / 3 files**, TypeScript and the Pages-base build. The
  earlier full-suite result is reused for unchanged code. CI runs the final
  complete suite again as part of publication.
- Five deployment-window tests passed. The existing JavaScript bundle-size
  warning remains; the exported models require no new decoding dependency.
- 59,590 camera samples, including a 10 cm washing-area grid, plus Overview:
  maximum all-visible submitted geometry **59,920 / 60,000 triangles**.
  Each relevant maximum also passed four outfit combinations, eight fade
  masks and restoration checks. All potential labels/rings and material
  passes are counted without frustum culling. This finite grid is not a proof
  over every continuous camera position.
- All **125** completed SHA-bearing ledger records match. The new Blend/GLB
  and diagnostic image audits are recorded per asset; the source/index text
  scan does not itself inspect binary metadata or rights. Before the fixed
  asset commit, source/index scan passed with 2,194 inspected / 0 findings;
  the corresponding dist passed with 47 inspected / 0 findings.

## Actual game rendering

Codex used an isolated local server and temporary Chrome tabs, leaving the
existing game servers and user tabs untouched. The diagnostic uses the real
GameScene, ModelLibrary, deriveView and FollowCamera with static injected
states. It does not perform acquisition, route completion or checkpoint play.

On local Apple M4, 32 GiB, macOS 15.7.7, at **1280 × 720, DPR 1**, all 18 models
loaded, the authored world was active and its primitive fallback was hidden.
Fixed scenes covered washing fixtures, reception, sauna/NPCs, outdoor water,
Duck's narrow tunnel/water connection, the footless Duck on the pond, held
coin/key/towels, head towels, the mural, low follow views and Overview. The
uncorrected arbitrary bath inspection camera was inside a wall; the actual
FollowCamera provided the valid bath views. This is a diagnostic camera issue,
not evidence of the game camera being inside a wall.

The first pass found overly dark metal because no reflection environment was
assigned. The final correction supplies one small generated linear-light cube
and uses Three.js's cached PMREM for physical materials. It adds no downloaded
asset or scene geometry. The input faces are 32 px; Three's prefilter creates
larger GPU faces internally. Mirrors use this stylized environment rather than
live scene reflections. White soap/towels, ceramics and skin retained visible
shading in the final local views; no captured warning/error logs were present.

Representative five-second rAF observations on the final light-corrected code:

| Static view | Calls | Triangles | FPS | p95 interval |
| --- | ---: | ---: | ---: | ---: |
| Washing inspection | 52 | 24,696 | 60.0 | 18.3 ms |
| Held coin, both clothed humans | 59 | 28,056 | 60.0 | 18.4 ms |
| Bath, initial follow direction | 36 | 26,488 | 60.0 | 18.5 ms |
| Bath, follow view toward washing area | 78 | 35,274 | 60.0 | 18.4 ms |
| Bath, follow view toward mural | 54 | 31,764 | 60.0 | 18.4 ms |
| Washing, head-towel follow view | 64 | 28,214 | 60.0 | 18.3 ms |
| Washing state, Overview | 90 | 39,964 | 60.0 | 18.4 ms |

The prior full asset pass also observed reception 21 calls, sauna 26, outdoor
bath 32, narrow tunnel 71, and the pond Duck 67 at about 60 FPS. Those were on
`4ec94c2`, before the reflection correction; do not label them reruns of the
later code. rAF measures displayed frame intervals, not GPU timer execution,
load-time performance or performance on every device.

## Remaining limits and publication

The refreshed set is stylized. Close rocks remain simpler than the art
reference, and the planting does not reproduce that reference's density.
Human meshes remain static without skeletal walking/carry/wiping animation.
The deferred designated-supervisor normal-input route and outstanding layout/F8
checks remain separate. Deployment does not complete those checks or submit
the work to the competition. No paid source, subscription or network setting
change was made for this refresh.

Publication verifies the successful Pages workflow, public version.json and
all distributed files against the workflow artifact. The current public
revision is available at [version.json](https://shunkat.github.io/sento-duck-explorer/version.json)
and the [Pages workflow](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml).
