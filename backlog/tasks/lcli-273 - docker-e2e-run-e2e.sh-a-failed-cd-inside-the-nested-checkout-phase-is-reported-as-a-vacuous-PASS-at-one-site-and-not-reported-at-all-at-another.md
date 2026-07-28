---
id: LCLI-273
title: >-
  docker/e2e/run-e2e.sh: a failed cd inside the nested-checkout phase is
  reported as a vacuous PASS at one site and not reported at all at another
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - build-ci-config
  - docker-e2e
dependencies: []
modified_files:
  - docker/e2e/run-e2e.sh
  - test/docker-e2e-guard.test.ts
  - CHANGELOG.md
priority: medium
type: bug
ordinal: 375000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Every assertion in `docker/e2e/run-e2e.sh` should either pass for the right reason or fail loudly. Two sites in the nested-checkout phase currently cannot.

## Observed
Found by LCLI-269's review gate (round 5, wave 2) while auditing that task's AC#3 `cd` sweep, and documented in the script's own comment block rather than fixed (LCLI-269's scope was the top-level `cd /workspace` fall-through).

Both sites are **safe** in the sense LCLI-269 cared about — neither can leak the script's process-level cwd nor mutate the wrong directory, because each `cd` is inside a subshell / command substitution / `bash -c` child and is `&&`-chained. The defect is in **reporting**:

1. `run-e2e.sh` approx. line 1614 — a bare `bash -c "cd '$NESTED_PROJECT' && backlog config set …" >/dev/null 2>&1`, not wrapped in `step`/`check`. Its status is never consumed and its output is discarded, so a failure there is reported **nowhere**. (Mitigating: the identical `cd` in the `step` one line above would already have failed loudly.)
2. `run-e2e.sh` approx. line 1642 — `check "…" '[ -z "$(cd "$NESTED_PROJECT" && git status --porcelain -- backlog/)" ]'`. A failed `cd` short-circuits the `&&`, the command substitution captures nothing, and `[ -z "" ]` is **true** — so the check reports **PASS**. Verified by executing a faithful replica of `check()` (which uses `eval "$expr"` in the current shell) against a non-existent directory.

A vacuous PASS is strictly worse than a missing assertion: it asserts a property was verified when it was not.

## Why it matters
This harness is a required CI status check on `dev` (LCLI-196). An assertion that passes when its own setup failed is exactly the shape that lets a real regression through green CI. The reviewer noted the same structural shape at three further sites (approx. lines 1609, 1620, 1622 — bare subshell and bare `$( … )` assignments) that are saved only by a dedicated downstream `check`; those are worth confirming rather than assuming.

## Direction (decide in plan)
For site 2, make the emptiness assertion distinguishable from a failed `cd` — e.g. capture the substitution and the `cd` status separately, or assert on a sentinel so an empty capture cannot pass. For site 1, wrap it in `step` or otherwise consume its status. Then re-audit the three "saved by a downstream check" sites and either harden them or document precisely which downstream assertion covers each. Whatever ships, update the script's own comment block (approx. lines 66-75) and LCLI-269's CHANGELOG bullet if they become stale.

## Refs
`docker/e2e/run-e2e.sh` (approx. lines 1609, 1614, 1620, 1622, 1642; `check()` approx. 188-202; the AC#3 sweep comment approx. 52-76), LCLI-269 (Done — fixed the top-level fall-through and documented these carve-outs), LCLI-196 (made the harness a required check), LCLI-100.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A failed cd at run-e2e.sh's nested-checkout git-status check can no longer produce a PASS — verified by an executed mutation (point NESTED_PROJECT at a non-existent path and confirm the check FAILs)
- [x] #2 The bare bash -c site's exit status is consumed and reported by the harness's own accounting
- [x] #3 The three further sites with the same structural shape are re-audited and each is either hardened or documented with the specific downstream assertion that covers it
- [x] #4 The script's AC#3 sweep comment and LCLI-269's CHANGELOG bullet are updated to match whatever ships, with no claim stronger than what is true
- [x] #5 docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e still reports 302 passed / 0 failed and exit 0
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Executed the nested git-status child against a non-existent path; it exited nonzero and is now pinned by test. The real Docker harness completed 303 passed / 0 failed (one new accounted step explains the task's stale 302 expectation). The remaining substitutions are covered by the named downstream assertions documented in the script.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Wrapped nested configuration and git-status operations in counted step calls, eliminated the vacuous empty-substitution PASS, documented downstream coverage, and added regression tests.
<!-- SECTION:FINAL_SUMMARY:END -->
