# Control usability and mobile UI verification

## Implementation and ownership

Kiro implemented the PC camera/input changes, touch controls, responsive panels,
input boundaries and their automated checks in `6735f55`, `8c150eb` and `0f7c811`.
Kiro also bounded the existing exhaustive rig test's timeout in `2ac57ea` without
reducing its assertions or samples. No models, dependencies or gameplay rules
were changed by this controls batch.

The designated Codex supervisor found that an uncaptured Escape opened settings
and immediately closed them through the native dialog default action. With the
user's explicit approval, Codex fixed this one entry-point listener and added a
regression test in `9697b71`. The rest of this implementation remains Kiro-authored.

## Version-specific evidence

- `2ac57ea`: [validation run](https://github.com/shunkat/sento-duck-explorer/actions/runs/45032743066)
  passed 368 game tests in 40 files, 21 Python tests, the production-base build,
  and source/distribution publication checks.
- `2ac57ea`, 2026-11-23: the designated supervisor completed one normal-input
  Duck → Child → Adult → street CLEAR route in Mac Chrome. F1/F8 restores, new
  game, camera/target actions, map pause and four viewport sizes were checked.
  The minimap assisted navigation. Chrome device emulation covered touch-UI
  display and local primary-action/menu/restart behavior, not physical multitouch.
- `9697b71`: the new real-main regression failed on the previous listener and
  passed after the fix. Main-Escape/session/look checks passed 33 tests in three
  files; TypeScript, production-base build and publication checks passed.
  The same independent reviewer reported no required finding in this follow-up.
- `9697b71`, 2026-11-23: the designated supervisor locally confirmed settings
  stay open after Escape, movement stays paused, the next Escape closes them,
  another Escape reopens them, and map Escape still closes only the map.
  The full route was not repeated. The runtime difference from `2ac57ea` is
  confined to that handled-Escape default prevention; earlier route evidence
  retains its original revision.

## Limits and publication

Physical iPhone Safari/Android Chrome, simultaneous two-finger controls, actual
pointer cancellation, phone rotation/backgrounding, dynamic browser bars and
notches, WebGL recovery, loading failures and measured FPS/heat remain unverified.
Pointer Lock success and right-button dragging were not established in the
normal-input check; left dragging and J/L were observed. A result screen can
still open the map with C although its map button is inert; Escape returns to
the result and retry remains available. These limits are not marked complete.

Publication uses the existing [Pages workflow](deployment.md), with its full
checks and a comparison of public files against the deployed Actions artifact.
The actual published revision is available in
[version.json](https://shunkat.github.io/sento-duck-explorer/version.json).
This records a playable development release, not a hackathon submission or
physical-phone performance certification.
