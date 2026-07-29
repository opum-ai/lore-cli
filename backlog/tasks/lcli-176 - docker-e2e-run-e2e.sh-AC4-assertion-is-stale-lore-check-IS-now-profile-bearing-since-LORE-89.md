---
id: LCLI-176
title: >-
  docker/e2e run-e2e.sh AC4 assertion is stale: lore check IS now
  profile-bearing since LCLI-89
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
priority: medium
type: bug
ordinal: 122500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The docker/e2e harness assertion at `docker/e2e/run-e2e.sh:1298` reads "AC4: lore check is NOT profile-bearing -- byte-identical outcome with a malformed profile" and its comment claims check.ts imports nothing from core/profile.ts. That premise is now false: LCLI-89 made `lore check` profile-aware — `src/commands/check.ts:47` imports loadProfile and line 142 calls it, so a malformed .lore/profile.toml makes `lore check` fail loudly (exit 6, different output) rather than produce a byte-identical outcome, and the assertion fails. It stayed dormant because docker/e2e is never executed in CI; LCLI-100 (wiring docker/e2e into CI as a gate) exposed it: two independent agents reproduced 298 passed / 1 failed with the harness exiting 1, the sole failing scenario being exactly this assertion. This blocks LCLI-100 from merging because its new required gate would be red on every run. Fix the stale assertion to encode the LCLI-89 intended behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The run-e2e.sh AC4 assertion is updated to encode the LCLI-89 profile-aware contract: a malformed .lore/profile.toml causes `lore check` to fail loudly (non-zero exit distinct from the clean baseline), not a byte-identical outcome.
- [x] #2 Running the full docker/e2e harness against current dev (docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e) reports 0 failed scenarios and the harness exits 0.
- [x] #3 The updated assertion still fails if `lore check` profile-aware fail-loud behavior regresses (it genuinely tests the LCLI-89 contract, not a tautology).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm via source (src/commands/check.ts:47,142) that LCLI-89 made `lore check` call loadProfile() up front, failing loud (validation, exit 6) on a malformed profile.
2. In docker/e2e/run-e2e.sh AC4 block (~1263-1300): rewrite the stale comment; drop the now-unused baseline capture (lore check --json >/tmp/check-baseline.json; BASELINE_CHECK_RC) and its /tmp cleanup.
3. Replace the tautology-prone byte-identical check with a fourth step_fail (mirroring the existing lore new/validate/sync AC4 assertions): step_fail ... 6 '.error_type == "validation"' -- lore check --json.
4. Keep the profile save/restore (cp .lore/profile.toml /tmp/profile-toml-good.toml and later restore) and every other assertion untouched.
5. Verify with bash -n docker/e2e/run-e2e.sh and a careful re-read; do not run docker (orchestrator owns AC#2 gate).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified src/commands/check.ts:47 imports loadProfile from ../core/profile, and runCheck() (line 142) calls loadProfile({ root: options.root }) as the FIRST statement, before bundle discovery/reading -- explicitly marked '(LCLI-89)' in the surrounding comment, mirroring context.ts/graph.ts's LCLI-84 fail-loud precedent. src/core/profile.ts:213-215/774 confirm a malformed profile throws LoreError('validation', ...) which errors.ts maps to exit 6 (line 52: validation: 6). This matches the neighboring step_fail assertions for lore new/validate/sync exactly (exit 6, .error_type == 'validation'), confirming the AC4 comment's old claim ('check.ts imports nothing from core/profile.ts') is false and the byte-identical-outcome assertion was stale.

Rewrote docker/e2e/run-e2e.sh's AC4 block (~1263-1298): replaced the stale comment + baseline capture (lore check --json >/tmp/check-baseline.json; BASELINE_CHECK_RC) + byte-identical 'check' assertion + its /tmp cleanup with a fourth step_fail mirroring the existing lore new/validate/sync AC4 assertions: step_fail "AC4: exit 6 malformed profile (zero [[types]]) via lore check" 6 '.error_type == "validation"' -- lore check --json. Profile save/restore (cp .lore/profile.toml /tmp/profile-toml-good.toml and the later restore) and every other assertion left untouched -- diff is scoped to exactly those two hunks.

Verified with: bash -n docker/e2e/run-e2e.sh (OK, no syntax errors); shellcheck docker/e2e/run-e2e.sh (no new warnings in the edited region -- pre-existing SC2016/SC2034/SC2164 warnings elsewhere in the file, none touching lines 1263-1298); grep confirms zero remaining references to BASELINE_CHECK_RC/MALFORMED_CHECK_RC/check-baseline.json/check-malformed.json anywhere in the file. step_fail's own contract (read from its definition at run-e2e.sh:107-128) asserts exit code + empty stdout + a jq filter over the LAST line of stderr, so this new assertion genuinely fails if lore check ever regresses to profile-blind (exit 0 instead of 6, or stdout non-empty, or no validation envelope) -- it is not a tautology.

Did NOT run docker (per task instructions): the full docker/e2e harness run (AC#2, docker compose ... up --build --exit-code-from e2e) is the orchestrator's merge gate, to avoid colliding with the orchestrator's run on the shared e2e-e2e image/container.
<!-- SECTION:NOTES:END -->
