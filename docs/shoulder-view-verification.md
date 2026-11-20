# Shoulder-view and real-model verification

Date: **2026-11-20 (JST)**. Operator: **Codex**, using normal native keyboard/browser controls in the dedicated Kiro Chromium. The local development server was kept fixed during each run. No runtime game-state inspection, state injection, or scripted teleportation was used.

## Versions and scope

| Version | Evidence |
| --- | --- |
| Asset main `2f0261d` | Duck, sauna hat, Child and Adult: original image → Meshy 6 Lite → Blender → exported GLB. Four-stage hashes, measured limits, attribution and independent cross-reviews complete. |
| Game `4bbc76d` | Earlier partial smoke: initial human bath models, F1/start restore, narrow-hole entry and shoulder-view walls/lid. This precedes later review fixes. |
| Game `a72b765` | Complete normal-input route; F1, F2, F4, F5, F6, F7; all four checkpoint restores; visual model/attachment checks. 127 automated tests and build passed. |
| Game `461ca315` | Adds Shift-modifier handling in `src/input/keyboard.ts`; all other game source is unchanged from `a72b765`. F3, its R restart and a subsequent ordinary walk across the soap passed in the browser. 136 automated tests and build passed. |

The full route was **not rerun from start to goal on `461ca315`**. Its input change was checked with targeted real-browser follow-up and automated input-to-game-rule regression tests. The route used the auxiliary overview for most positioning, with shoulder-view inspection at clothing, hand-held hat, equipped/carry and carried-Duck milestones. The explicit shoulder-view hole inspection belongs to the earlier `4bbc76d` partial smoke, not the `a72b765` full-route evidence. This is not a claim of an exclusively shoulder-view playthrough.

## Normal-input results

**Full route: PASS on `a72b765`.** Duck found the coin through the small hole and transferred it to Adult. Both humans dried, entered changing together, dressed, paid at reception, undressed and returned to the bath. Adult gave the key to Child; both entered the sauna dry. Child traversed the crowd gaps, borrowed the hat and returned. Child equipped Duck, Adult carried Duck with Child nearby through the open-air bath to the pond, then placed Duck in the water. Steering around both rocks brought **Duck itself, wearing the hat**, into the goal. The clear screen and HUD were observed; humans stayed at the pond entrance. No game-over occurred during this complete route.

| Failure condition | Observed result |
| --- | --- |
| F1 — towel in bathwater | Game-over and towel explanation; R restart observed. |
| F2 — entering changing while wet | Game-over after both humans were close enough to pass the accompaniment gate. |
| F3 — running onto soap | On `461ca315`, Shift+D produced F3. After R, the same path without Shift remained playable, confirming that running did not stay latched. |
| F4 — leaving changing for reception unclothed | Game-over with the dress-before-reception explanation. |
| F5 — entering sauna wet | Game-over; R restored the paid-return checkpoint. |
| F6 — shouting in sauna | Game-over; the explanation retained the exception for alerting others/staff about illness or danger. |
| F7 — pushing near the sauna crowd | Game-over; R returned to the paid-return checkpoint. |

| Checkpoint | State observed after a real failure and R |
| --- | --- |
| `start` | Duck active; initial bathwater positions; coin in hole, key at reception, locked sauna, hat on shelf. |
| `paidReturned` | Adult active; both humans dry in bath; coin paid; key Adult; sauna locked; hat on shelf. |
| `hatEquipped` | Child active; three characters together on bath floor; hat equipped on Duck; key Child; sauna open; coin paid. |
| `duckInPond` | Duck active in the pond with hat; both humans at pond entrance; key Child; sauna open; coin paid. |

For the pond restore check, the humans were walked back to the bath and F1 triggered before R; a saved-checkpoint HUD alone was not counted as a restore.

## Model and camera observations

- Child and Adult face/hair textures rendered. Clothing toggles showed the coral/navy and teal/charcoal outfits, then the simplified bathing variants, without obvious simultaneous outfit rendering.
- The borrowed hat mesh was observed at Child's right hand from a side angle. It sat on Duck's head after equip, then remained with Duck on Adult's raised hand while moving and turning.
- Switching to the carried Duck placed the view at its actual elevated position. The occluding Adult visibly faded.
- In the earlier `4bbc76d` partial smoke, Duck entered the narrow hole and the shoulder view stayed within its walls/lid in the observed frames. The `a72b765` full route traversed the hole, but that log does not establish a repeated shoulder-only hole inspection. C switching, keyboard orbit and character switching were used in the later route.
- Humans have static poses. The environment and remaining small props are still largely primitives. Item labels can obscure small hand-held meshes at some angles; close walls/lockers can require orbiting, and the overview helps precise gate/crowd positioning. These are recorded polish items, not an assertion of a finished art pass.

## Input diagnosis and review fixes

The initial native Shift+D attempts did not trigger running. A temporary, ignored local diagnostic page showed `KeyD` down/up events with `shiftKey=true`, but **no independent ShiftLeft/ShiftRight events**. It did not read or change game state. Standard Shift-key events already passed a separate synthetic input-to-rule check; that was not called a browser pass.

`461ca315` also reads the Shift modifier attached to movement events, including input after focus is acquired while Shift is held. The fallback clears on movement release, blur, hidden document and detach, while the standard left/right Shift paths remain supported. The browser F3 follow-up then passed. The diagnostic page is not part of the game or public build.

Independent Codex reviewers found and rechecked fixes for camera interpolation safety, held-strafe feedback, fade shader recompilation, off-axis label sizing, carried-Duck framing, first-frame checkpoint reset, and equipped-hat fallback alignment. The final Shift input change was independently reviewed. Code/math reviews and synthetic tests are distinct from the normal-input observations above.

## Publication and ownership

Kiro Crew authored the shoulder camera, controls, scene changes and initial model connection. After repeated Crew network errors, both Kiro workers stopped; Codex preserved their saved human-connection work, completed the small model connection, and fixed independent-review findings. Kiro's interrupted verifier was not reported as having completed the final review. Codex operated image/Meshy/Blender production and this browser verification.

The final 136-test suite and production build passed. Source/index, distribution, commit messages and public author/committer metadata were checked; no private-value findings were detected. Binary asset metadata and redistribution rights were reviewed separately. These checks are not an exhaustive confidentiality guarantee. Four runtime GLBs total **1,684,808 bytes**; scene FPS/draw-call targets were not measured. The build retains its existing large-chunk advisory.

Models retain **CC BY 4.0** with Meshy attribution and modification notices; project code remains MIT. Notices and sidecars are present in the build. Raw operator logs and browser/conversation screenshots are not published. Screenshot observations were made through the control tool; no game-only screenshot file was saved.

The branch is for review. PR #3's ModelAdapter consolidation, skeletal animations, environment assets, Costume Contest presentation and submission/deployment remain separate work. The live browser was left at the initial Duck shoulder view with all keys released.

## Item-label follow-up (`bef0a59`, Kiro Crew)

Change: in the shoulder view a held or worn item shows no label (the status panel names the holder); resting items and the overview keep their label, bottom-anchored above the model (shoulder-view Req 7.5).

| Check | Result | By |
| --- | --- | --- |
| `npm test` | 138 passed (2 new label tests fail on the previous code) | Crew A, re-run by Crew B |
| `npm run build`, publication check on source and `dist` | Passed | Crew A, Crew B |
| Browser, single keys: coin label above the coin, overview labels | Passed | Crew B |
| Held/worn hat and key without labels during play | NOT RUN | — |
| Full route on `bef0a59` | NOT RUN. Last full route: `a72b765`; input retest: `461ca315` | — |

Low remaining items: the 受付台 label floats off the map edge in the overview; the scene wiring of the rule (`sizeLabels` with item owners) has no automated test; the hat-top test assumes the 0.08 m resting offset used in `scene.ts`.

## Simpler controls (`5f2c93b` and the towel-anchor follow-up, Kiro Crew)

New version: T and G removed; E dries at the bath-side exits, dresses at the locker, and moves the towel between hand and head (Duck has no towel). Earlier sections describe the T/G build and stay as recorded.

| Check | Result | By |
| --- | --- | --- |
| Automated tests incl. an E-only clear route and real key events | Passed (see the commit message for the count) | Crew A |
| Build, publication check on source and `dist` | Passed | Crew A |
| Normal-input browser play of the new controls and towel display | NOT RUN | — |
