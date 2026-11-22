# Contextual help and world notices — 2026-11-22

Base: `2538208`, branch `feat/contextual-help`. User-requested presentation work by Codex. Existing Kiro-authored growth, input and renderer behavior is retained; this change is not recorded as a Kiro implementation run.

## Scope

- Permanent route objective, full key list and floating room/fixture/character/milk labels removed.
- A compact stage/milk badge and current actionable keys remain. Invalid stage/height interactions keep explicit rejection feedback without advertising a usable key.
- Settings expose a persistent help checkbox, with a default-on and storage-unavailable fallback. Settings pause the game, isolate UI input and clear held/queued inputs on open/close.
- Six fixed world posters cover drying at both doors, sauna quiet/no pushing and illness exception, walking, keeping towels out of the bath, and dressing before reception. Two small wall plaques mark the bath entrances. Text and pictograms are original runtime Canvas drawings under the code MIT license; no external assets or licenses are added.
- Help off hides control hints and instructional prompts. It leaves world notices, growth/door feedback, failure explanation and restart/new-game instructions available.

## Automated evidence and independent review

- Focused help guidance and E regression checks: 14 passed. Help preferences/settings/input checks: 23 passed. These overlap existing input tests and are not additional unique test totals.
- Production build with the Pages base path passed. The existing bundle-size advisory remains.
- The initial full run passed 265 cases and exposed four old-test failures after labels were removed and textured notices added. The affected rig, texture-surface and scene-budget assumptions were updated without weakening their contracts; the targeted three-file run then passed all 12 cases. Together these runs account for all 269 tests across 32 files. The full suite was not unnecessarily repeated.
- Independent reviewer checked the full presentation/input/signage diff. One required issue was fixed: disabling help must hide an already-visible prompt immediately while the settings loop is paused. The targeted help/settings/view run passed all 17 cases after the fix. The reviewer rechecked the fix and affected test updates and reported no remaining required findings.
- Sign placement tests sample nine points per board against the actual published environment GLB. Faces are outside the supporting surface with ordinary depth testing. This is placement evidence, not camera readability or ordinary-input play.

## Final normal-input checks (designated supervisor)

These checks are pending and must join the supervisor's final combined batch. This session did not operate a browser or repeat the growth route.

- Help on/off at milk, drying, locker and door locations, and Q/V/F only under the corresponding conditions. Reload and checkpoint/new-game behavior preserve the setting.
- Settings with mouse, Tab, Enter, Space and Escape; no movement, queued action or camera drag while open or immediately after closing. Minimap opening/closing continues to pause and restore independently after integration.
- Clear view at Duck/Child/Adult heights with no floating descriptions. Compact hints and settings remain usable on narrow displays without overlapping the minimap.
- Drying posters readable from the safe side before crossing either doorway; dressing poster visible along the changing-room aisle; sauna/floor/towel notices readable with real models loaded. Help off must leave these physical notices intact.
- One growth-to-street route and the supervisor's necessary failure/recovery checks on the final combined fixed commit. Earlier release gameplay evidence is not attributed to this new presentation version.

## Publication and contest scope

The user authorized resolving concurrent conflicts and merging this change into production main. Public-handle/noreply local commit metadata, current main, deadline and source/index/distribution scans are checked before push. No force push, account permission change, paid service or Devpost submission is part of this work.

The official [Kiroween rules](https://kiroween.devpost.com/rules) were rechecked on 2026-11-22; the published deadline remains 2026-12-04 14:00 PST (2026-12-05 07:00 JST). Category fit and participant eligibility remain separate unresolved submission matters from `kiroween-review.md`; this display change is not a claim of contest acceptance.
