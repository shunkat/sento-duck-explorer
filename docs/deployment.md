# GitHub Pages deployment

The user authorized publishing the development demo and automatic deployment of main on 2026-11-20. Codex prepared this deployment configuration; Kiro remains the primary game implementer. This publishes a playable development build, not a Devpost submission or a claim that the remaining artwork and gameplay checks are complete.

- Site: https://shunkat.github.io/sento-duck-explorer/
- Workflow: [Validate and deploy Pages](https://github.com/shunkat/sento-duck-explorer/actions/workflows/pages.yml)
- Published revision: [version.json](https://shunkat.github.io/sento-duck-explorer/version.json)

## Automatic publication

PRs targeting main run source/index publication checks, deadline boundary tests, `npm ci`, the game tests, a production build with `--base=/sento-duck-explorer/`, and distribution publication checks. Node 26 and the committed npm lockfile are used. The Actions used directly by the workflow are pinned to reviewed commit SHAs.

Pushes to main run those same checks, upload only `dist/`, and deploy that exact artifact through the `github-pages` environment. Manual runs may publish only main. The build has read-only repository permissions; only the deploy job receives `pages: write` and `id-token: write`. No personal access token or external hosting account is stored in the workflow.

Builds for the same ref replace older unfinished builds. Deployments run one at a time and an active deployment is not cancelled by a newer push. Immediately before publication, the job checks that its SHA is still the current main and rechecks the clock. A stale run is skipped, including manually rerun old workflows. If validation fails, the existing site remains available. A runtime defect after a successful deployment still requires a revert.

The distribution includes the code's `LICENSE`, `THIRD_PARTY_NOTICES.md`, and each GLB's license file. The game links to the third-party notices. Git history, source references, editable Blender files and operator records are not included in the site. The publication scanner is a heuristic; it does not inspect binary metadata, licensing or history.

## Initial repository settings

Set Settings → Pages → Source to **GitHub Actions**. Restrict the `github-pages` environment to the `main` branch. No recurring reviewer approval is required for the user-authorized automatic deployments. These repository settings are separate from this workflow file.

## Retry, rollback and stop

- For a transient failure on the current main, rerun the failed workflow from Actions, or run this workflow manually with branch `main`. The full check/build flow precedes publication. A failed build may require a code correction first.
- For a deployed regression, revert the faulty change through the normal reviewed main-update process before the cutoff. The new main must pass all checks before it replaces the site. Re-running an old SHA is deliberately blocked; do not force-push history for a rollback.
- To stop automatic updates immediately, disable this workflow in Actions. The last successful Pages deployment remains available. Re-enable only within the permitted publication window.

## Submitted-version freeze

The project records its deadline as **2026-12-05 07:00 JST / 2026-12-04 22:00 UTC**. New deployments stop at **06:45 JST / 21:45 UTC**, leaving 15 minutes for the deploy action's 10-minute timeout and cancellation. The time is checked on the runner before upload and again directly before deployment; a delayed or manually rerun workflow cannot rely on its original event time. After the cutoff, checks may run but publication is skipped.

Before the cutoff, retain the chosen commit and confirm the successful workflow and `version.json`. Disable this workflow as part of the final submission freeze. Do not remove the cutoff to modify the submitted site after the deadline. Future development can use a separately authorized site.

## Verification scope

Deployment verification checks the public HTML, JavaScript, four GLBs, notices, code license and revision against the built artifact. It does not count as another normal-input playthrough. Reuse the existing version-specific gameplay evidence in [shoulder-view-verification.md](shoulder-view-verification.md); any remaining gameplay scenarios belong to the designated supervisor's final verification.

### Initial publication, 2026-11-20

Codex published commit `2477c1b` after an independent deployment-only review with no required findings. [The initial Actions run](https://github.com/shunkat/sento-duck-explorer/actions/runs/44734646664) passed 219 game tests, five deployment-window tests, the production build and source/distribution publication checks. All 14 published files returned HTTP 200 and matched the downloaded Actions artifact by SHA-256, including `version.json`, all four GLBs and the licenses. HTTPS and the environment's main-only branch policy were confirmed. No browser playthrough was repeated. The follow-up pins Pages actions v5 to remove the old Node 20 compatibility warning; subsequent run results remain in Actions.
