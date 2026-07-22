---
id: LORE-176
title: >-
  docker/e2e run-e2e.sh AC4 assertion is stale: lore check IS now
  profile-bearing since LORE-89
status: To Do
assignee: []
created_date: '2026-07-22 14:28'
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
The docker/e2e harness assertion at `docker/e2e/run-e2e.sh:1298` reads "AC4: lore check is NOT profile-bearing -- byte-identical outcome with a malformed profile" and its comment claims check.ts imports nothing from core/profile.ts. That premise is now false: LORE-89 made `lore check` profile-aware — `src/commands/check.ts:47` imports loadProfile and line 142 calls it, so a malformed .lore/profile.toml makes `lore check` fail loudly (exit 6, different output) rather than produce a byte-identical outcome, and the assertion fails. It stayed dormant because docker/e2e is never executed in CI; LORE-100 (wiring docker/e2e into CI as a gate) exposed it: two independent agents reproduced 298 passed / 1 failed with the harness exiting 1, the sole failing scenario being exactly this assertion. This blocks LORE-100 from merging because its new required gate would be red on every run. Fix the stale assertion to encode the LORE-89 intended behavior.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The run-e2e.sh AC4 assertion is updated to encode the LORE-89 profile-aware contract: a malformed .lore/profile.toml causes `lore check` to fail loudly (non-zero exit distinct from the clean baseline), not a byte-identical outcome.
- [ ] #2 Running the full docker/e2e harness against current dev (docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e) reports 0 failed scenarios and the harness exits 0.
- [ ] #3 The updated assertion still fails if `lore check` profile-aware fail-loud behavior regresses (it genuinely tests the LORE-89 contract, not a tautology).
<!-- AC:END -->
