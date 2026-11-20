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

## Simpler controls (`5a7866f`, Kiro Crew; normal-input verification by Codex)

New version: T and G removed; E dries at the bath-side exits, dresses at the locker, and moves the towel between hand and head (Duck has no towel). Earlier sections describe the T/G build and stay as recorded.

| Check | Result | By |
| --- | --- | --- |
| Automated tests incl. an E-only clear route and keyboard-event integration | 160 passed on `5a7866f` | Crew A, independently re-run by Crew B |
| Build, publication check on source and `dist` | Passed on `5a7866f` | Crew A, Crew B |
| Independent core/input and view reviews | No remaining required findings; the floating held-towel issue was corrected in `5a7866f` | Codex reviewers; Crew B final re-review |
| Normal-input full route with the new E controls | CLEAR on `5a7866f` | Codex |
| Towel display and a real failure/restart restoring the saved towel | Passed within the observations below | Codex |

The source remained frozen at `5a7866f821cd8bc42b4f1cb929349c6f2f40e734` throughout the run. The game was reloaded normally, then operated through native keyboard controls. No runtime state inspection, injection or teleportation was used. The overview assisted positioning; shoulder views were used to inspect the models and attachments. This was not an exclusively shoulder-view playthrough.

- Duck's E did not give it a towel. Child's E moved the towel from hand to head while the body stayed wet. Q with the towel on the head showed an explanation without game-over; E back to hand followed by Q in the tub caused F1. Both humans' held towels were visibly connected to their right hands.
- At the changing-room exit, T and G did nothing. E dried only the active human and put its towel on its head; the other human stayed wet until separately dried. At the locker, T/G remained inactive and E changed clothes. The clothed Adult and its head towel were observed in the shoulder view.
- The normal coin, payment and return route passed. After `paidReturned` was saved, Adult was walked into the tub, switched its towel to the hand and triggered F1 with Q. R restored both humans dry and Adult's head towel. E handed the key to Child instead of toggling the towel.
- Child was deliberately made wet before the locked sauna. The first E dried Child and left the door locked; the hint changed to unlocking. The next E unlocked the door. Both humans entered, and Child borrowed the hat and returned through the crowd gaps.
- E equipped Duck's hat, picked Duck up, and placed it in the pond without being intercepted by the towel toggle. Duck wearing the hat, and Adult carrying Duck with its hat while also wearing a head towel, were observed in shoulder views. The full route ended at the clear overlay with the hat-wearing Duck at the pond goal and both humans at the pond entrance.

The held hat's mesh was not sufficiently visible during this run because of the wall/HUD; its ownership was confirmed in the HUD. That observation does not replace the earlier held-hat visual check on `a72b765`, and it does not complete the separate held-hat/key label checklist. The full F1–F7 and all-four-checkpoint manual suite was not repeated; those earlier results retain their original versions above. This run specifically rechecked F1 and the `paidReturned` towel restore, while the automated suite covered the other rules and checkpoint state.

The towel remains a provisional mesh, independent of outfit variants. Its head position uses body height and model bounds; the held towel hangs from the hand socket. The four existing GLBs and their hashes/licenses were unchanged. Final towel art still requires the image → Image-to-3D → Blender pipeline.

## Water-only Duck movement (`29eba52`, Kiro Crew; normal-input verification by Codex)

This corrects the previous build's land-walking Duck. Outside Adult's arms, Duck moves only on the tub, the new connected water channel and coin hole, or the pond. Shared bath-water geometry drives movement, the drawn channel, placement, human wetness and towel dipping. Floor drops are refused, and the hat checkpoint restores Duck on the tub water.

The source remained fixed at `29eba523f0fc4ca9d804eb948dad5c5d6fa6e486` throughout this run. Codex reloaded the existing local game normally and used native keyboard controls, the overview for route positioning, and shoulder-view orbit for directional and attachment checks. No runtime state inspection, injection or teleportation was used. This was not an exclusively shoulder-view playthrough.

| Check | Observed result |
| --- | --- |
| Water boundaries | Sustained movement toward representative positions on all four tub shores stopped at the water edge. A diagonal direction obtained with camera orbit and forward movement did not leave the water. |
| Visible channel and coin | Duck swam through the drawn channel into the narrow hole, collected the coin, returned to the tub and transferred it to Adult. |
| Human route through the channel | Both humans became wet crossing the channel, dried with E at the sauna entrance, entered together and retrieved the hat. |
| Hat checkpoint | Child equipped Duck at the water's edge. A real F1 followed by R restored the hat-wearing Duck on the tub water at the new checkpoint. |
| Carried input and floor drop | After Adult picked Duck up, switching to Duck and holding W and D separately did not move Duck independently. E on dry floor showed the refusal and left Duck carried. |
| Transport and goal | Adult carried the hat-wearing Duck with Child through the open-air area, placed it in the pond with E, and Duck reached the goal. The clear overlay was observed with the humans at the pond entrance. |
| Model observation | The equipped hat and carried Duck/hat were visible in shoulder views. |

**Full normal-input route: CLEAR.** Kiro A and independent verifier B also passed **174 tests**, the production build and publication checks on source and distribution. Independent Codex core and view reviews found no remaining required code defects; stale design descriptions of Duck drying and land recovery were corrected in the documentation follow-up. Existing GLBs and their attribution were unchanged.

The new test suite covers the shared water geometry, shore collision, channel joints, invalid starting positions, accepted/refused water drops, wetness/towel rules and checkpoint continuation. The normal-input run specifically repeated the hat checkpoint restore; it did not repeat all four restores or all F1–F7 cases, a channel-specific towel dip, or a valid bath-water drop/re-pickup. Earlier version-specific evidence remains above. The channel/hole surfaces are provisional geometry for the later environment art pass.

## Child carries Duck to the coin channel (Kiro Crew, fix set in progress)

New version: the coin channel is separated from the tub by dry floor; Child carries Duck to the channel entrance before the hat; Adult carries it to the pond after the hat. The previous section describes the connected-channel build and stays as recorded; its playthrough does not carry over to this version.

| Check | Result | By |
| --- | --- | --- |
| Automated tests (Child-required coin, real-input carry → coin → Adult, input ignored by either carrier, refused drops, per-carrier view, paidReturned restore with Child holding Duck, dry gap) | Passed | Crew A |
| Build, publication check on source and `dist` | Passed | Crew A |
| Normal-input playthrough | Final check pending (one run after the whole fix set) | — |
