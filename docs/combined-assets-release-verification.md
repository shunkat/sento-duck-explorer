# Combined growth-route and visual release — 2026-11-22

This integration combines production `392962f5a516237d30ba8336457b3d49ad82a7f2`
with the visual branch through `745dd279c429dab268a5f01b586d3553a2fbf741`.
It retains one active form, two ordered milk pickups, the guardian, the child
passage, adult latch and street-boundary exit. The playable Adult face and
13-bone human walking, independent adult visitors, inward-facing Fuji mural
and original koi tattoo appearance are included together.

## Fixed asset contract

The combined environment v05 is
`98f43e692fa430c2595acdf7c879a004735b4d0bc1b503a00fa69889b6cdde46`,
6,850,416 bytes, 22,064 triangles (9,907 architecture + 12,157 NPC), 17 materials
and 11 images. The existing 7 MB / 22,200 triangle world budgets remain effective.
The current growth layout hash is
`01d4ef0eda8966fe87ec3ac4551bcce129bd697040ae6dd201a0cff50e9ceba8`.
Both parent GLBs and records are archived; the integration producer compares
all active architecture leaves with the growth parent and all visitor leaves,
materials and image payloads with v04. The intended Fuji UV correction remains.

Raw geometry checks find zero degenerate triangles, zero intersections in the
19 inspected opening interiors (moving doors excluded), and zero intersections
with five occupied seat boards. The editable packed Blender reimport retains
geometry, UVs and all 11 images. Offline reimport renders are asset evidence,
not normal-input gameplay evidence. See the [world record](../assets/sento_environment/README.md)
and [parent comparison](../assets/sento_environment/quality/v05/parent-preservation.json).

## Integration-specific checks

Only the visible human form walks. Hidden forms reset to rest, and growth starts
the new form at rest rather than reusing a hidden animation phase. The right arm
holds the towel while the other limbs walk. The former carrier/item logic is
removed from this growth integration. Scene-budget checks cover each single
visible stage and both human outfits, including camera fading/restoration.

The producer regressions cover malformed/replaced geometry, source preservation,
Fuji orientation, tattoo payload preservation and publication deadline handling.
A historical NPC test now uses its archived v03 clearance record instead of the
mutable current world record; this prevents an unrelated layout revision from
invalidating that historical producer's contract.

Independent review and the final automated, normal-input and publication results
are recorded below once each check completes. Earlier release records remain
historical; no earlier playthrough is claimed to validate this combined revision.

## Automated and independent results

- Combined source: 256 tests / 29 files passed; TypeScript check and repository-base production build passed. The existing bundle-size advisory remains non-failing.
- Python: 20 of 21 initially passed; the remaining test had used the mutable world record while integration was in progress. After switching it to its matching archived v03 record, all 9 tests in that producer file passed. The other 12 tests were unaffected.
- Independent integration review: Required 0; growth semantics, visible-stage motion, both-parent geometry/payload preservation and final shared records reviewed. No duplicate gameplay or suite run.
- Ledger: 211 rows, including 206 SHA-bearing rows; all 206 actual files match. Source and distribution publication inspections passed with zero findings.
- Diff whitespace check passed except the deliberately byte-preserved upstream Quaternius license (CRLF/trailing spaces); its author license is unmodified.
