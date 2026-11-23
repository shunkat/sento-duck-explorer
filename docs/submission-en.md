# Sento Duck Explorer: English submission draft

Draft for the Kiroween 2026 English description. It is a working draft, not a submitted entry.

## Current exploration update (2026-11-23)

Growth now requires two bottles per transition, four in total. Duck visits the main tub and shallow pool. Child asks the nearby adult for company, waits for the adult to reach the sauna entrance, dries off and enters together. The sauna and far side of the open-air bath each hold a required Child bottle; either order is supported, and the final pickup leaves an Adult-sized return path. Adult then dries, dresses and exits through the street door. Collection and escort checkpoints preserve partial progress. The same batch adds human-model visitors in the bath hall, with short surprise reactions to nearby growth and clear travel paths. Existing credited visitor assets are reused. This revision is Codex implementation; automated checks, independent review and the designated supervisor's final normal-input verification are separate activities, and earlier route results do not validate the new route. Requirement 11 and the current design are the source of truth.

Accompaniment is a rule of this fictional facility, not a claim that sauna use is safe for every child with an adult present.

## Visual update (2026-11-22 record)

The 2026-11-22 game had one active character growing from Duck to Child to Adult through two milk pickups, with a final street exit. Independent visitors, a correctly oriented Fuji mural and an original tattooed visitor are combined with the current growth architecture. See [combined verification](combined-assets-release-verification.md). The complete environment and small props now use reviewed GLBs from approved free public sources and project-authored Blender geometry. Human v03 adds a corrected Adult face atlas and shared skeletal walking; detailed revision and verification boundaries are in [the human release record](human-face-walk-verification.md). The older route results below remain historical and are not claimed to validate this revision.

## Historical status (2026-11-20 merge integration)

- Duck, Child, Adult and the sauna hat are real GLBs from original reference images → Meshy Free / Meshy 6 Lite → Blender adjustment. Clothing variants and item/carrier attachments follow game state. The reference, generated, Blender and final stages are recorded in the asset ledger.
- Humans have static poses. The environment and props other than the hat remain provisional; skeletal animation and a finished visual presentation remain open.
- Codex recorded complete normal-input routes, using the overview for positioning and shoulder views for model/attachment observations. The latest Child-carry run began on `617ca58`, paused for the carrier-label correction, and continued on fixed `83cc945` to CLEAR, including Child-held payment-checkpoint recovery after F3. This is not an exclusively shoulder-view playthrough. The complete F1–F7 and four-recovery suite was not repeated on that version; earlier observations retain their own commit boundaries. See [verification](shoulder-view-verification.md).
- The ModelLibrary and property-test merge integration passed 219 tests across 16 files and the production build. It did not repeat normal-input/browser checks. The earlier cloud failure and 83-test success are preserved as separate historical records in the [prototype progress](../.kiro/specs/prototype-core-gameplay/progress.md).
- No user study, learning effect or accident reduction is claimed.
- Development demo: [GitHub Pages](https://shunkat.github.io/sento-duck-explorer/). The [deployment workflow](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml) records publication status and the built commit. No demo video is recorded. This is a draft, not a Devpost submission.

## Current direction (2026-11-21)

The user replaced character switching with growth: the player starts as the duck, drinks milk bottles to grow into the child and then the adult, and clears by leaving the bathhouse through the front entrance. Details are in the prototype-core-gameplay spec (Requirement 11, design "Growth and exit"). The sections below describe the earlier three-character version and its verification, kept as a record; they will be rewritten for the submission once the growth version is verified.

## Summary (three-character version, 2026-11-20)

Sento Duck Explorer is a 3D cooperative puzzle set in a fictional Japanese public bathhouse (sento). The player switches between three characters, a duck, a child and an adult, and combines their different abilities to reach a hidden pond. The duck must arrive there wearing a sauna hat.

The game is built with Vite, TypeScript and Three.js. Game logic is pure code in `src/core/`.

## The three characters

| Character | Role |
| --- | --- |
| Duck | Fits through a narrow hole to find a 500-yen coin, hands it to the adult, and is later carried to the pond and steered along its current to the goal. |
| Adult | Receives the coin, pays the sauna fee at reception, gets the sauna key and hands it to the child. Carries the duck to the pond. |
| Child | Carries Duck from the tub across dry floor to the separate coin channel before the hat. Receives the key, opens the sauna, slips through gaps in the sauna crowd that only a child can pass, takes the duck-sized sauna hat and puts it on the duck. |

The child and adult are a parent-child pair. They must stay within 3 m of each other to move between areas together.

## The 10-step route

1. Start as the duck.
2. Child carries Duck across the dry gap to the water channel. Duck then swims into its narrow hole and finds the family's 500-yen coin.
3. The duck gives the coin to the adult.
4. The adult leaves the bath, pays the sauna fee and gets the sauna key.
5. The adult gives the key to the child.
6. The child enters the sauna and weaves through the child-only gaps in the crowd.
7. The child gets the sauna hat and puts it on the duck.
8. The adult carries the hat-wearing duck through the open-air bath to the hidden pond.
9. The adult places the duck in the pond.
10. The player steers the duck along the current to the goal at the back of the pond. Reaching it clears the game.

## Game-over rules (F1 to F8)

These rules are unchanged in the growth version and apply while the player is the child or the adult. Each rule is a bathhouse manner. Breaking one ends the attempt and the game restarts from the latest checkpoint.

| ID | Rule |
| --- | --- |
| F1 | Putting a towel in the bath |
| F2 | Entering the changing room without drying off |
| F3 | Running onto a soap bar |
| F4 | Going from the changing room to reception, the common area or outside the building while unclothed. Moving from the changing room to the ordinary bath area is not a violation. |
| F5 | Entering the sauna without drying off |
| F6 | Pressing the V key (the nuisance-shout action) while in the sauna |
| F7 | Pushing people aside in the sauna |
| F8 | Trying to walk into the women's bath entrance as Adult or Child (the receptionist calls you back). Duck cannot climb its step. Added 2026-11-20 |

F6 is a deliberate rule-break action: the V key makes the child or adult let out a nuisance shout. The game does not use a microphone, does not recognize speech and does not classify calls for help. Calling for help is not meant to be punished, but no help-calling action exists in the prototype yet, so none is claimed. (The on-screen Japanese text for F6 already says to tell people nearby or staff when someone feels unwell.)

## Cultural and safety framing

- The facility, its rules and its prices are fictional. The 500-yen sauna fee exists only inside this game. It is not presented as a typical fee or as a rule shared by real bathhouses.
- The manners come from publicly described bathhouse etiquette (for example, wash before bathing, keep towels out of the bath). They are a game design starting point.
- Any educational value for families is a hypothesis. It has not been tested and is not claimed as a result.

## How Kiro was used

The original Spec, cloud documentation work and later Crew implementation are recorded separately.

- **Spec (requirements-first):** `requirements.md` was generated with the built-in requirements workflow and refined per requirement with the requirement-detailer sub-agent. The built-in design sub-agent failed twice, so `design.md` and `tasks.md` were written directly by the main Kiro agent.
- **Steering:** `.kiro/steering/project-autonomy.md` supplied provisional decisions and the working style.
- **Spec format validation:** used when `requirements.md` and `design.md` were created. It was unavailable later, so later edits were not machine-validated.
- **Background process:** the Vite dev server ran as a Kiro-managed background process.

At the time of the prototype Spec, Hooks, MCP servers, Powers, Skills and custom agents were not used. The handoff document plans hooks, but none have been created.

### Original cloud run (English draft and review fixes)

- The GitHub Power was used for repository work (branch, commits, pull request #1).
- The orchestrated planner, coder and reviewer agents were used to plan the draft, write it and review it. Their findings led to the corrections in this document.
- That cloud run verified 83 tests, build and publication scans, without a browser check. Those results are historical, not a validation of the later integrated code.

### Kiro Crew

Crew implemented the shoulder camera, contextual controls, water-only Duck movement and Child/Adult cooperation. The implementer and independent reviewer recorded their version-specific checks and findings. Kiro Web authored the ModelAdapter and property-test PRs.

## Role of Codex

Codex produced the original reference images, operated the authorized free Meshy workflow, adjusted and exported the models in Blender, and recorded their provenance. Codex supplied limited integration assistance after Crew communication failures, performed the recorded independent reviews and normal-input checks, and maintained publication checks and development records. During PR integration, Codex resolved overlapping model-loading paths, updated the earlier property tests to the current game rules and synchronized this draft. Kiro authored the original game and the recorded Crew work; the 2026-11-23 exploration/growth/escort revision is implemented by Codex and is recorded separately.

## Run it locally

```sh
npm install
npm run dev      # http://127.0.0.1:5173/
```

Controls are listed in the English section of `README.md`.

## Not yet done

- Remaining visual checks identified in the verification record, including held-hat/key alignment; an exclusively shoulder-view route has not been demonstrated.
- Separate authored drying/pickup/carry-transition motion clips and the deferred normal-input verification of the current asset batch.
- Costume Contest presentation remains a proposal, not a user-adopted feature.
- A demo video under 3 minutes in English or with English subtitles, and Devpost submission. Freeze the public demo at the submitted version as described in [deployment](deployment.md).
