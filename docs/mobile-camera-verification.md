# Mobile camera framing verification

## Scope and ownership

With explicit user approval after a fresh Kiro request was stopped by its monthly
usage limit, Codex implemented this mobile-camera batch in `a7c277c`. Initial
controls remain Kiro-authored; the earlier Escape repair is separately recorded
in [controls verification](controls-verification.md). No models, licenses,
dependencies, collider sizes, movement speeds or gameplay rules changed.

The fixed candidate `f62bb5b` merges current main `aac8557` to preserve its
separately reviewed [help appearance change](contextual-help-verification.md).
Camera source and tests are unchanged across that merge; main retains both the
new viewport connection and updated help wording. The same independent reviewer
found no required camera defects in the integrated version.

## Automatic evidence

- Integrated `f62bb5b`, 2026-11-23: 391 game tests in 43 files passed, as did
  TypeScript and the production-base Vite build. The existing bundle-size
  advisory remains. The publication scanner's 21 Python tests also passed in
  the preceding camera run; its implementation did not change in the merge.
- Production GLB bounds at four viewports (320×568, 390×844, 568×320, 844×390),
  three stages, eight facings and duck bob are projected in 160 configurations.
  Duck bounding height is within 12–25%, width at most 40%, center within
  42–58%, with horizontal clearance. These are conservative geometric bounds,
  not measured visible silhouettes or a guarantee about every animation frame.
- Tests cover coarse startup and late touch through actual main, actual renderer
  projection/fade consumption, orientation and resize transitions, manual-angle
  retention, desktop pose invariance, opacity recovery and representative wall,
  corner, closed-door-sized, low-fixture, hole and ceiling safety. Near-plane
  corners are checked at pitch limits and during growth.
- Source/index scan: 2,802 inspected, zero findings. Distribution scan: 53
  inspected, zero findings. These are heuristic checks, not asset-rights or
  binary-metadata audits. No new third-party materials were introduced.

## Fixed-version normal-input evidence

The designated supervisor completed one combined normal-input Duck → Child →
Adult → street CLEAR route on `f62bb5b` in Mac Chrome on 2026-11-23. Chrome phone
emulation supplied the mobile UI/camera; movement and actions used normal
keyboard and browser UI input, not state injection or physical multitouch.
F1/F8 checkpoint restores continued the unfinished route without another full
playthrough. Settings/map pause, new game, initial coarse-pointer reload and
late mobile activation were also observed.

Approximate visible duck silhouette measurements from saved screenshots (not
GPU bounds, about ±2–3 px at the boundary; ring excluded):

| Viewport | Horizontal center | Visible height |
| --- | ---: | ---: |
| 320×568 | 47.3% | 14.3% |
| 390×844 | 46.8% | 14.2% |
| 568×320 | 49.1% | 14.7% |
| 844×390 | 49.2% | 15.9% |

The body stayed clear of the stick/buttons in these baseline views. Child and
adult heads, feet and head towels fitted the selected four-size views; an adult
held towel was also checked in landscape. Manual view direction and growth
stage persisted across viewport changes. The portrait silhouette was slightly
below the approximate 15–20% design goal and left a clear path ahead. Automated
projected-bound acceptance passed separately; the two measurements are not interchangeable.

Wall approach visibly faded the active body; leaving the wall restored a small,
opaque-looking body and its ring. Strong wall compression still enlarges and
crops the body toward the bottom, and can move the ground ring out of frame.
Ring opacity is preserved; always-on-screen visibility is not guaranteed.
No through-wall/roof view was observed at the sampled positions. Continuous
frame smoothness and exact GPU opacity were not measured by this visual pass.

The integrated help captions were readable against sampled bright/dark
backgrounds and distinguishable from actual buttons. The longer PC wording
fitted 320×568 and 568×320. A locker world caption remained thin when viewed
obliquely; the HUD fallback was readable. This remains a documented limitation,
not a claim of readability at every angle. A previous door toast briefly
remained after new game, although progress reset correctly.

The supervisor closed the task's tab and preview server and released ownership.
Before/after inventories confirmed unchanged HEAD, tracked files and build;
older controls/Escape records were preserved.

## Coverage limits and publication

Physical iPhone Safari / Android Chrome, simultaneous two-finger control,
notches/dynamic bars, device rotation/backgrounding, FPS and heat remain
unverified. Browser emulation and automated geometry checks do not establish
those properties. Free-space size targets do not apply when a wall forces the
camera close or the user deliberately chooses extreme pitch.

Publication uses the existing [Pages workflow](deployment.md), including public
file comparison against the deployed Actions artifact. The published revision
is recorded in [version.json](https://shunkat.github.io/sento-duck-explorer/version.json).
This remains a development release, not a hackathon submission or physical-phone
performance certification.
