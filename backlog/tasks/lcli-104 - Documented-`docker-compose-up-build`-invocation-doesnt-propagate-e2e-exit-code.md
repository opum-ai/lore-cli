---
id: LCLI-104
title: >-
  Documented `docker compose up --build` invocation doesn't propagate e2e exit
  code
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
labels:
  - codex-review-followup
  - build-runtime
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 118000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The usage comment in docker-compose.yml:4 documents running the harness as `docker compose -f docker/e2e/docker-compose.yml up --build`, but plain `docker compose up` always returns exit code 0 regardless of the `e2e` service's own exit code, since neither `--exit-code-from e2e` nor `--abort-on-container-exit` is present anywhere in the file or its comments. Because no CI workflow currently wraps or wires this command (no references to `docker compose` exist under `.github/workflows/`), any caller that scripts this exact documented command and checks `$?` would treat a failing E2E run as a success.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The documented invocation in docker-compose.yml's usage comment includes `--exit-code-from e2e` (or an equivalent flag) so the `docker compose up` command's own exit code reflects the `e2e` service's pass/fail tally.
- [x] #2 Running the documented command against a deliberately failing e2e run (e.g. a forced-fail step) exits non-zero, matching run-e2e.sh's own failure exit code.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update the usage comment in docker/e2e/docker-compose.yml (lines 4 and 16) to add --exit-code-from e2e so documented invocation propagates the e2e service exit code.
2. Validate edited YAML with 'docker compose -f docker/e2e/docker-compose.yml config -q'.
3. Prove --exit-code-from semantics with a throwaway scratch compose file running a deliberately failing service, confirming $? != 0.
4. Record evidence in task notes/final-summary and mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated both documented invocations in docker/e2e/docker-compose.yml's usage comment (lines 4 and 20) to include --exit-code-from e2e, plus a comment sentence explaining why (plain 'up' always exits 0 regardless of the e2e service's result). Comment-only change; services: block untouched.

Verification:
1. 'docker compose -f docker/e2e/docker-compose.yml config -q' on the edited file -> exit 0 (YAML still parses).
2. Built a throwaway scratch compose at scratchpad/lore-104-proof/docker-compose.yml with a single service running 'exit 1' (simulating a failing e2e run), project name 'lore104proof' (distinct from the real harness's 'e2e' project, per the one-docker-compose-at-a-time constraint). Ran it twice:
   - 'docker compose -p lore104proof up' (no flag, mirroring the pre-fix documented command): e2e-1 exited with code 1, but compose's own $? = 0 -- reproduces the bug plain 'up' has.
   - 'docker compose -p lore104proof up --exit-code-from e2e' (the fixed documented invocation): e2e-1 exited with code 1 and compose's own $? = 1 -- proves --exit-code-from e2e propagates the failing service's exit code as documented in AC#2.
   Cleaned up with 'docker compose -p lore104proof down --volumes --remove-orphans' (exit 0, no leftover containers/networks).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed docker/e2e/docker-compose.yml's usage comment (lines 4 and 20) to document 'docker compose ... up --build --exit-code-from e2e' instead of plain 'up --build', with an added comment sentence explaining why (plain 'up' returns 0 regardless of the e2e service's own exit code). Comment-only change -- services block untouched. Verified: (1) 'docker compose -f docker/e2e/docker-compose.yml config -q' on the edited file exits 0, proving the YAML still parses; (2) a throwaway scratch compose project (lore104proof) with a single service that runs 'exit 1' showed plain 'up' exiting 0 despite the failing container (reproducing the bug) while 'up --exit-code-from e2e' exited 1 (matching the failing service), proving the documented flag makes compose's own exit code reflect the e2e service's pass/fail tally. Scratch project torn down cleanly afterward. Both ACs checked on this evidence.
<!-- SECTION:FINAL_SUMMARY:END -->
