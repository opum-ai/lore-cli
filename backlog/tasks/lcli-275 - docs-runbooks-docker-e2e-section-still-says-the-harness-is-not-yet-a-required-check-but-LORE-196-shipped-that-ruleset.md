---
id: LCLI-275
title: >-
  docs/runbooks: docker-e2e section still says the harness is 'not yet a
  required check', but LCLI-196 shipped that ruleset
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:31'
labels:
  - docs-drift
  - build-ci-config
  - docker-e2e
dependencies: []
modified_files:
  - docs/runbooks/docker-e2e-testing-environment.md
  - docs/runbooks/dev-kickoff.md
  - .github/workflows/ci.yml
priority: low
type: bug
ordinal: 377000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
`docs/runbooks/docker-e2e-testing-environment.md` should state the harness's actual CI enforcement status.

## Observed
Found by LCLI-269's review gate (round 5, wave 2) and left as an explicitly out-of-scope note.

The section heading around line 30 still reads: *"CI gate (runs in CI since LCLI-100; **not yet a *required* check** — see LCLI-196)"*.

LCLI-196 is `Status: Done`. Verified live: `gh api repos/:owner/:repo/rulesets` shows `require-docker-e2e-on-dev` (id `19698059`) with `enforcement: active`, targeting `refs/heads/dev` with the docker-e2e status check required.

## Why it matters
The runbook tells a contributor the check is advisory when it is in fact blocking, which is backwards in the direction that wastes their time (they will be surprised by a red required check). Small, but this project's standing lesson applies: a confidently-worded but wrong doc is worse than a missing one.

## Important nuance to get right
The ruleset carries `bypass_actors: [{RepositoryRole 5 (admin), bypass_mode: "always"}]`, so a repo admin can merge past it and the campaign's own merge queue routinely does (with `--admin`, compensated by running the harness locally on integrated `dev`). "Required" is therefore true for a non-admin actor and bypassable for an admin — say both, rather than replacing one imprecise claim with another.

## Direction (decide in plan)
Correct the heading and any surrounding prose that depends on it. Sweep the whole file — and `docs/runbooks/dev-kickoff.md` and `CONTRIBUTING`-style docs if they restate it — for other claims about the harness's enforcement status, rather than fixing only the cited line.

## Refs
`docs/runbooks/docker-e2e-testing-environment.md` (approx. line 30), `.github/workflows/ci.yml` (the `docker-e2e` job, approx. line 197), ruleset `require-docker-e2e-on-dev` id `19698059`, LCLI-196 (Done — made it required), LCLI-100 (Done — made it run in CI), LCLI-269 (Done — surfaced this).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The runbook states the harness is a required status check on dev, and states accurately that the ruleset carries an admin bypass
- [x] #2 The enforcement claim is verified live against the ruleset API rather than reconstructed from task history, with the verification recorded in the task notes
- [x] #3 The whole file and any peer doc restating the harness's enforcement status are swept, not just the cited heading
- [x] #4 lore check stays green
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified live against active ruleset 19698059: dev requires the exact docker E2E status context and RepositoryRole 5 (admin) retains an always bypass. Swept the runbook, dev kickoff, and CI comments.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the Docker E2E runbook and peer guidance to say the check is required on dev for non-admins and accurately document the admin bypass.
<!-- SECTION:FINAL_SUMMARY:END -->
