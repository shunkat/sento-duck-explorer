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
- Independent reviewer checked the full presentation/input/signage diff. The first required issue was fixed: disabling help must hide an already-visible prompt immediately while the settings loop is paused. The targeted help/settings/view run passed all 17 cases after the fix. The reviewer rechecked the fix and affected test updates and reported no remaining required findings.
- Sign placement tests sample nine points per board against the actual published environment GLB. Faces are outside the supporting surface with ordinary depth testing. This is placement evidence, not camera readability or ordinary-input play.

## Concurrent minimap integration

The reviewed help implementation `2c5467c` was merged locally with the completed minimap implementation `89f6d18`. Four conflicts (`index.html`, keyboard, main loop and HUD) were resolved in the isolated help worktree; the supervisor's minimap worktree, HEAD, server and browser were not modified.

- Preserve the persistent/tappable map and its pause/resume behavior. C can close the full map but is blocked inside settings; a separate map-key gate expresses that distinction.
- Preserve the compact contextual HUD, settings, persistent preference and physical notices. The on-demand large map retains its navigation labels.
- Integrated full suite: **291 tests passed across 33 files**. The reviewer then found and fixed the queued native close/reopen edge in settings; the matching regression and settings/minimap tests passed **23/23** afterward. The final source contains **292 cases**, all covered by these runs. Final production build passed with the pre-existing bundle-size advisory.
- Source/index and distribution publication scans passed with zero findings. The scanner is heuristic and does not audit binary metadata or rights; no binary or third-party asset is introduced here.

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

## Help appearance follow-up — 2026-11-23

Base: `9c710ea`, implementation: `3953c4f`, branch `fix/help-text-affordance`. Codex addressed the user's
report that help looked like a button. World target text and the HUD target and
secondary-action hints now use outlined/shadowed caption text without a filled
panel or border. PC target text says `Eキーで…`; touch labels retain their action
wording. Actual settings, map, touch and restart buttons are unchanged.

- Focused existing help, target, touch-UI and main-Escape checks: **39 passed in
  five files**. TypeScript and production-base build passed; the existing
  bundle-size advisory remains. No new tests were added for this appearance edit.
- This changes presentation only: target selection, depth testing, prompt
  placement, help preferences, input and game rules are unchanged.
- Independent review of `3953c4f`: no required findings. Source/index and
  distribution publication checks passed with zero findings. These scans are
  heuristic; they do not establish binary metadata or asset-rights clearance.
- The first publication workflow passed 368 of 369 tests; the scene-budget
  test's Canvas stub lacked the standard `strokeText` method now used by help.
  Adding that stub method made the existing scene-budget test pass locally.
  Its geometry measurements and 60,000-triangle assertions are unchanged.
- Final visual confirmation belongs to the designated supervisor's combined
  verification batch: check world text and HUD fallback against bright tiles
  and dark rooms, narrow-screen wrapping of the longer PC wording, and clear
  distinction from usable touch/settings buttons. No browser or playthrough was
  performed for this follow-up, and earlier route results retain their revisions.
- The user requested production publication on 2026-11-23 through the existing
  main/Pages workflow. The deployed revision is recorded by `version.json` and
  its corresponding Actions run. No assets, dependencies or licensing terms
  changed; submission matters in `kiroween-review.md` remain open.

The designated supervisor later checked this help-appearance follow-up together
with the camera batch on `f62bb5b`: sampled bright/dark captions and narrow PC
wording passed; oblique locker text remains a limitation. See
[mobile camera verification](mobile-camera-verification.md) for the exact scope.
