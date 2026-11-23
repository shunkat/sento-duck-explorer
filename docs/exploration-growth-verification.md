# Exploration, adult escort and bath visitors — 2026-11-23

This batch implements the user's request for longer exploration, two bottles per
growth, milk inside the sauna and at the open-air bath, and a Child who asks an
adult to enter the sauna together. Two bottles for each transition (four total)
is the adopted interpretation. Positions, order flexibility, gate assistance and
partial-progress checkpoints are implementation choices recorded in Requirement
11 and its design. The same batch includes the follow-up request to populate
the bath hall with human models who visibly react to nearby growth (Requirement 13).

## Ownership and version

Codex implemented this batch with one core worker and one independent reviewer.
The fixed implementation is `06a050a` on `codex/exploration-growth`, based on
`b8a3161`. This document is a later record; source/assets/dependencies remain
those of `06a050a`. No development server was started for this batch. Previous normal-input
results belong to their recorded versions and do not validate this new route.
The designated existing Codex supervisor retains the single final normal-input
playthrough, following `.kiro/steering/verification-ownership.md`.

No model binary, material source, asset license, dependency version or authored
building geometry changes. The existing milk GLB is instantiated four times.
Four bath-hall visitors reuse the standing bather GLB and its existing far-detail
version. Within 3 m of visible growth they turn toward the player, recoil and
briefly rise, then return to rest within 1.6 seconds. Low partitions can be seen
over; full walls block the reaction. At most two new visitors use close detail.
Restart clears reaction timers; ordinary bottle pickups do not trigger them.
Runtime item positions are separate from the environment export: its historical
layout digest includes the former item nodes. The geometry regression reproduces
that digest with its preserved export nodes while still checking every current
baked placement. This is not a new Blender export or a new asset-rights review.

## Validation

- `npm test`: 437 tests in 46 files passed, including both bottle orders,
  F1–F8, all six checkpoint types, input boundaries, model integration and
  nearby/distant/occluded visitor reactions.
- `npm run build`: passed, including TypeScript checking. The existing warning
  about a minified chunk larger than 500 kB remains.
- The scene-budget regression uses real GLB geometry, all visible material
  passes, camera/detail sweeps and all player stages. Four bottles and four new
  visitors stay within the existing 60,000-triangle limit.
- Independent review found and corrected R1: running Child could collect sauna
  milk before the adult entered. The adult now walks fully across first while
  Child waits, and only then is Child admitted. A focused numerical simulation
  independently confirmed adult-before-child entry and safe subsequent growth.
- R2: initial visitors overlapped the guardian or a walking corridor, and the
  first recoil sign leaned toward growth. Anchors were moved and recoil reversed.
  Independent checks used the real high/far GLB bounds over 259,200 sampled
  combinations of routes, growth sites and reaction times, with no overlaps for
  the adopted final placement. After the last coordinate-only change, the
  affected visitor suite (10 tests, including the new high/far tub-recoil
  regression) and full-scene budget test passed,
  and the production build was rerun. The earlier 437-test full-suite result is
  retained with this explicit change boundary, rather than called a second run.
- Independent review completed with no unresolved required findings. The dist
  publication scan passed with zero findings (53 inspected files); the source
  scan also passed with zero findings. Author and committer use the existing
  public handle and GitHub noreply identity, without attribution footers.
  Scans are heuristic; no new history, remote or asset-rights audit is claimed.

Tests of the deterministic simulation, mocked DOM and parsed GLBs are not
browser playthrough evidence. No visual smoothness or ordinary-input success is
inferred from these automated results.

## Final normal-input checks — pending with the designated supervisor

Run one full route on the fixed version: tub bottle, pool bottle and Child
growth, child passage, E request to the adult and assisted gate opening, drying
and entry into the sauna together, sauna bottle, far-side open-air bottle and
Adult growth, return to dry/dress, reception, genkan and street exit.

Within the same verification window, use local checks for:

- One bottle keeps the stage; two grow it. Four bottle models and map markers,
  pickup disappearance, progress feedback and the guardian request remain clear
  with PC and touch controls.
- An unaccompanied Child is stopped. A requested adult still far from the door
  does not grant entry. Both characters actually enter together; running or
  collecting the open-air bottle first does not bypass accompaniment.
- Wet sauna entry still triggers F5; drying permits entry with the adult.
  Sauna exit requires drying again before changing. Other F1–F8 checks are
  covered automatically; manual checks should be scoped to relevant changes.
- Restart after the first Duck bottle, accepted request and first Child bottle
  preserves collected bottles, stage, gate state and actual guardian position.
- Open-air-first then sauna growth has an Adult-sized return route. No extra
  complete playthrough is requested for this ordering check.
- Observe the four bath-hall visitors, their clearance from the moving guardian
  and player, the nearby pool-growth reaction, a distant visitor staying still,
  and return to rest without replay on checkpoint restoration.
- Help off hides optional instructions while growth/progress feedback, posted
  manners, failure reasons and restart controls remain available.

No browser was operated by this implementation session. No merge, push or
release is claimed by this document.
