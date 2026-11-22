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

## Initial normal-input attempt (historical)

Supervisor checked fixed merge `b4d4f16ea27c4f6bbc2d4e35869594eebd401930`
using the production build and repository URL base, on 2026-11-22. The source,
models and HEAD remained fixed throughout. Initial preview base-path setup was
corrected before gameplay began; no application code changed.

Observed through normal keys: model loading and overview; Duck swimming from
the tub through the narrow water connection into the shallow pool; E collecting
milk1 and becoming Child; 1/2 milk and the Child checkpoint displayed; a towel
on the head staying out of the water, then a hand-held towel triggering the F1
message. No application-state injection was used.

The first native R input was followed by a return to the initial Duck screen
and shoulder camera, rather than the displayed Child checkpoint. A browser
reload or a game restoration fault was not independently established. After
returning to the Child pickup for local investigation, the browser control
reported a detached command. Rebinding recovered observations, but subsequent
key inputs through both documented input paths did not visibly change the
page. The captured console log API returned no entries. This was an incomplete
interactive check, not a passed playthrough or proof of a game defect.

At the end of that attempt, the remaining route (Child passage, Adult growth,
drying/dressing, both doors,
street-only clear), normal-input checkpoint recovery and remaining local
failure cases were **not yet verified interactively**. Their automated coverage
and independent review passed; those are separate evidence. Close-up runtime
walking, corrected face, Fuji and tattoo visibility also remained interactive
follow-ups; actual-export offline renders and geometry/UV checks passed.
The user authorized production integration; that publication proceeded with this
boundary disclosed. The resumed verification below closes these pending checks.

## Resumed final verification — completed

On 2026-11-22 the same supervisor resumed the remaining checks on fixed
`41a7038ecb95dbdefd67e848f940cfc86890a71b` (a documentation-only successor of
the merge above). Application source, models, dependencies and build settings
are unchanged from the tested merge. The existing production build was served
with the repository URL base. Its expired preview process was restored before
continuing; no source edit, rebuild, checkout or server restart occurred during
the subsequent gameplay checks. Browser ownership was released after the final
clear and evidence capture.

### Input diagnosis and method

Plain R caused an actual browser navigation/reload. On an independent keyboard
diagnostic page it also reloaded when the page attempted to prevent the key's
default action, whereas R in a focused text field arrived normally. Alt+R and
Alt+V arrived as trusted `KeyR`/`KeyV` events with only Alt set. This establishes
interception outside the game's restart handler; the responsible browser
component or extension was not identified. No browser, security or remote-access
settings were changed for this diagnosis.

The remaining game checks used ordinary documented keyboard input with Alt
held, preserving the same `event.code` consumed by the game. Shift was added for
running. Overview was used for route navigation and positioning; close-up
visual checks used the normal shoulder camera. There was no application-state
injection or scripted game-state change.
Checkpoint recovery worked with Alt+R. The earlier Duck reset is therefore not
evidence of a checkpoint defect. For similar symptoms, inspect key delivery and
navigation separately before declaring a game bug, missing permission or need
for user intervention.

The interrupted Duck-to-Child segment was re-entered after the external reload;
failure cases used the existing checkpoints for local checks. This was the
continuation of the final verification slot, with one completed exit route,
not an uninterrupted failure-free run or a second independent full playthrough.

### Observed results

| Scope | Normal-input observation |
| --- | --- |
| Growth and route | Duck water connection and first milk produced Child, 1/2 milk and the Child checkpoint. Child traversed the passage and collected the second milk, producing Adult, 2/2 and the Adult checkpoint. Adult opened the high latch. |
| F1 | Hand-held towel in bath water triggered its failure message; a towel on the head did not. |
| F2 | Wet entry into the changing room triggered its failure message. |
| F3 | Running over soap triggered its failure message. |
| F4 | Approaching reception without clothes triggered its failure message. |
| F5 | Wet sauna entry triggered its failure message; drying first allowed entry. |
| F6 | Shouting in the sauna triggered its failure message. |
| F7 | Pushing near the sauna visitor triggered its failure message. |
| F8 | Approaching the women's entrance from the lobby triggered its failure message. |
| Recovery | Alt+R restored Child with 1/2 milk and head towel, and Adult with 2/2 milk, wet/unclothed state, head towel and the high latch closed. Local checks could then continue without repeating both pickups. |
| Final exit | Drying at the mat and dressing at the locker worked. Reception and genkan did not clear the game. E opened the front door without clearing; crossing into the street displayed Adult (outside), dry/clothed, 2/2 milk and the clear overlay. |
| Runtime visuals | Close-up Adult face had distinct eyes and profile without the earlier smear. Mid-stride captures showed leg extension, bent knee and arm movement; the hand towel followed the held arm while the other arm moved. The inward-facing Fuji mural, separate seated/standing visitor appearances and tattoo detail were visible in the rendered game. |

Child movement through the passage was observed; a separate close-up Child
stride was not captured. Shared human-rig behavior also has the automated and
offline evidence listed above. These observations do not claim every camera
angle, browser or mobile device was tested. No game or asset correction was
required by this final check. Existing automated results are reused, not rerun
or relabeled as tests of the later documentation-only commit.

Independent review of this completion record and six captured images found
Required 0. Its two documentation advisories (historical tense and camera-mode
scope) were applied. The reviewer did not repeat gameplay, tests or the build.
