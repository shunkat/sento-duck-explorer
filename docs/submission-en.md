# Sento Duck Explorer: English submission draft

Draft for the Kiroween 2026 English description. It is a working draft, not a submitted entry.

## Status (read first)

- Placeholder models only. Every character and object is built from procedural primitive geometry generated in code (boxes, spheres, capsules, cones, cylinders and rings in Three.js), with no imported model files.
- The final asset pipeline (reference image, Image to 3D, Blender adjustment, integration into the game) has **not** been done.
- In a browser, only the first half of the route has been checked (by Codex, 2026-11-20). The second half has not been checked in a browser. It passes only as an automated, input-driven test.
- No user study has been run. This document makes no claim about learning effects or accident reduction.
- No deployed URL and no demo video exist yet. A local dev server address is not a submission URL.
- In this cloud run, `npm ci` failed with HTTP 403 (the sandbox allows repository access only), so tests and build were **not run**. The 83 passing tests recorded in `.kiro/specs/prototype-core-gameplay/progress.md` come from earlier verification on the Mac side on 2026-11-20. Treat that as a prior record, not a result of this run. Only `python3 scripts/check-publication.py`, diff checks and a comparison of the text with `src/` were done here.
- No browser check was done in this run. No browser tool was available among the tools exposed to this run. This says nothing about what Kiro Web offers in general.

## Summary

Sento Duck Explorer is a 3D cooperative puzzle set in a fictional Japanese public bathhouse (sento). The player switches between three characters, a duck, a child and an adult, and combines their different abilities to reach a hidden pond. The duck must arrive there wearing a sauna hat.

The game is built with Vite, TypeScript and Three.js. Game logic is pure code in `src/core/`.

## The three characters

| Character | Role |
| --- | --- |
| Duck | Fits through a narrow hole to find a 500-yen coin, hands it to the adult, and is later carried to the pond and steered along its current to the goal. |
| Adult | Receives the coin, pays the sauna fee at reception, gets the sauna key and hands it to the child. Carries the duck to the pond. |
| Child | Receives the key, opens the sauna, slips through gaps in the sauna crowd that only a child can pass, takes the duck-sized sauna hat and puts it on the duck. |

The child and adult are a parent-child pair. They must stay within 3 m of each other to move between areas together.

## The 10-step route

1. Start as the duck.
2. Find a 500-yen coin in a hole only the duck can enter.
3. The duck gives the coin to the adult.
4. The adult leaves the bath, pays the sauna fee and gets the sauna key.
5. The adult gives the key to the child.
6. The child enters the sauna and weaves through the child-only gaps in the crowd.
7. The child gets the sauna hat and puts it on the duck.
8. The adult carries the hat-wearing duck through the open-air bath to the hidden pond.
9. The adult places the duck in the pond.
10. The player steers the duck along the current to the goal at the back of the pond. Reaching it clears the game.

## Game-over rules (F1 to F7)

Each rule is a bathhouse manner. Breaking one ends the attempt and the game restarts from the latest checkpoint.

| ID | Rule |
| --- | --- |
| F1 | Putting a towel in the bath |
| F2 | Entering the changing room without drying off |
| F3 | Running onto a soap bar |
| F4 | Going from the changing room to reception, the common area or outside the building while unclothed. Moving from the changing room to the ordinary bath area is not a violation. |
| F5 | Entering the sauna without drying off |
| F6 | Pressing the V key (the nuisance-shout action) while in the sauna |
| F7 | Pushing people aside in the sauna |

F6 is a deliberate rule-break action: the V key makes the character let out a nuisance shout. The game does not use a microphone, does not recognize speech and does not classify calls for help. Calling for help is not meant to be punished, but no help-calling action exists in the prototype yet, so none is claimed. (The on-screen Japanese text for F6 already says to tell people nearby or staff when someone feels unwell.)

## Cultural and safety framing

- The facility, its rules and its prices are fictional. The 500-yen sauna fee exists only inside this game. It is not presented as a typical fee or as a rule shared by real bathhouses.
- The manners come from publicly described bathhouse etiquette (for example, wash before bathing, keep towels out of the bath). They are a game design starting point.
- Any educational value for families is a hypothesis. It has not been tested and is not claimed as a result.

## How Kiro was used

Two runs are described separately.

- **Spec (requirements-first):** `requirements.md` was generated with the built-in requirements workflow and refined per requirement with the requirement-detailer sub-agent. The built-in design sub-agent failed twice, so `design.md` and `tasks.md` were written directly by the main Kiro agent.
- **Steering:** `.kiro/steering/project-autonomy.md` supplied provisional decisions and the working style.
- **Spec format validation:** used when `requirements.md` and `design.md` were created. It was unavailable later, so later edits were not machine-validated.
- **Background process:** the Vite dev server ran as a Kiro-managed background process.

At the time of the prototype Spec, Hooks, MCP servers, Powers, Skills and custom agents were not used. The handoff document plans hooks, but none have been created.

### This cloud run (English draft and review fixes)

- The GitHub Power was used for repository work (branch, commits, pull request #1).
- The orchestrated planner, coder and reviewer agents were used to plan the draft, write it and review it. Their findings led to the corrections in this document.
- Not verified here: tests, build and browser behavior (see Status).

## Role of Codex

- Operated Chrome for the first-half browser check on 2026-11-20 and reported the results.
- Added the publication scanner (`scripts/check-publication.py`), the publication and hackathon steering file, the third-party notice and the Three.js license inclusion in the build.
- Wrote and edited steering and documentation for publication and scheduled work.

The game implementation is Kiro-authored.

## Run it locally

```sh
npm install
npm run dev      # http://127.0.0.1:5173/
```

Controls are listed in the English section of `README.md`.

## Not yet done

- Browser check of the second half of the route, the camera transition and the F2 to F7 screens.
- Final models through the Image to 3D and Blender pipeline, and the asset rights review (see `docs/assets-and-licenses.md`).
- Public deployment URL.
- Demo video under 3 minutes, in English or with English subtitles.
- Devpost submission.
