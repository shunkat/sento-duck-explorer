# Independent background adults

Integration update (2026-11-22): this revision is included in the combined growth-route release. Historical per-asset checks below retain their original scope; see [combined release verification](combined-assets-release-verification.md) for the final integrated evidence.

The background adults previously reused the playable father's Meshy geometry.
Seven existing placements now use three separate Quaternius-based roles:
reception staff, an older standing visitor and a bearded seated visitor. The
father's geometry, UVs and textures are not reused in these models. The actual
[same-scale comparison](../assets/sento_visitors/quality/father-and-distinct-visitors.png)
is separately credited as a CC BY 4.0 composite because it also depicts the father.

The free Universal Base Characters Standard source is CC0; project modifications
are MIT. No paid edition or service was used. Twenty selected original files,
the author license and checksums are preserved under `assets/public_sources/`.
The [production record](../assets/sento_visitors/README.md) covers facial clarity,
continuous clothing masks, source preservation and the distinct adult poses.

## Accepted output (NPC replacement v02)

Three near models use 1,593 / 1,594 / 1,794 triangles. Their distant variants use
593 / 594 / 594. All six have one mesh, one material and one embedded 512px atlas.
The composed world has 20,153 triangles and 5,931,660 bytes. Non-NPC mesh data,
materials, images and all 64 node transforms/hierarchy are preserved from v01.
The previous six NPC exports and world GLB remain archived with their licenses.

The seated model uses the existing bench frame with local +Z0.32m forward
placement and six locally adjusted support vertices. Exact triangle clipping
confirms zero penetration into all five occupied benches and all eleven tested
openings. Vertex/ray samples alone had missed a thin triangle penetration; the
new regression checks use the complete faces. Near/far slot bounds differ by at
most 19.731mm. Independent review found **zero required shape corrections** after
actual near/far export views, intended-distance views and world placement views.

## Verification

- `npm test`: **292 tests / 28 files passed**, including actual model adoption,
  all seven independent NPC sources, seat contact and the 60,000-triangle
  finite camera-grid budget. This is not a continuous-space or frame-time proof.
- `npm run build -- --base=/sento-duck-explorer/`: passed; the existing large
  JavaScript chunk warning remains.
- Replacement producer regressions: 9 passed. Root reused those results.
- The 18 registered GLBs total **8,633,972 bytes**, below the 12MB initial budget.
- 165 completed asset-ledger checksum records matched their actual files.
- Source publication scan: 2,413 files / zero findings at adoption; final staged
  scan also required before commit. Built distribution scan: 47 files / zero findings.
- Original sources, runtime embedded PNGs and editable Blend metadata have
  separate, scoped audits. Original source metadata is not silently rewritten.

This branch includes the earlier face/UV and human-walking batch described in
[human-face-walk-verification.md](human-face-walk-verification.md). Those prior
checks are not relabeled as new normal-input play. No normal-input full play or
new GPU frame-time benchmark was performed for this intermediate asset batch.

## Integration handoff

The isolated branch is `assets/distinct-sento-npcs`. Main/production remain
unchanged while the separate growth/exit work is being integrated. Its code and
layout changes must be reconciled with this branch before the one shared final
playthrough. In particular, retain the earlier walking fix and recheck the
current authoritative layout digest; do not overwrite a changed growth world
with the old v01 layout without assessing the differences.

[World reconstruction](../assets/sento_environment/README.md) documents the
versioned original world, independent NPC masters and the private replacement,
measurement and editable-reimport workflow. The final world SHA is
`39cfd9954b2de71807ecf3e860063f0569a9bd2611f322b361c10232f963950e`.

That v02 export is preserved under `assets/sento_environment/blend/`. The later
[Fuji mural correction](../assets/sento_mural/README.md) changes only four mural
U coordinates; the NPC geometry, textures, placements and these review results
remain applicable. Its world checksum is recorded separately.
