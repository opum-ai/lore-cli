---
id: LORE-104
title: >-
  Documented `docker compose up --build` invocation doesn't propagate e2e exit
  code
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 The documented invocation in docker-compose.yml's usage comment includes `--exit-code-from e2e` (or an equivalent flag) so the `docker compose up` command's own exit code reflects the `e2e` service's pass/fail tally.
- [ ] #2 Running the documented command against a deliberately failing e2e run (e.g. a forced-fail step) exits non-zero, matching run-e2e.sh's own failure exit code.
<!-- AC:END -->
