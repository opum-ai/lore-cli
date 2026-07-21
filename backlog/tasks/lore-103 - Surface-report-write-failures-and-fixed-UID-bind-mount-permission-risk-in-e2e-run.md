---
id: LORE-103
title: >-
  Surface report-write failures and fixed-UID bind-mount permission risk in e2e
  run
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
ordinal: 117000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docker-compose.yml:13 bind-mounts the host directory `./results` into the container at `/results`, while Dockerfile:81 runs the container as a fixed non-root `bun` user at uid 1000 with no configurable UID/PUID mapping; on hosts where uid 1000 doesn't own (or isn't writable by) `./results`, writes to the report will fail with a permission error. Compounding this, run-e2e.sh's `record()` and `check()` functions append to `$REPORT` via `jq -n ... >>"$REPORT"` without checking the write's exit status, and the script runs under `set -uo pipefail` (no `-e`), so a failed write to the report file is silently swallowed rather than causing the run to fail loudly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 If the append to `$REPORT` inside `record()` or `check()` fails (e.g. permission denied or disk full), run-e2e.sh detects the failure and causes the overall script exit code to reflect it, instead of continuing silently.
- [ ] #2 The e2e harness documents or implements a way to avoid uid-1000-vs-host-uid permission mismatches on the `./results` bind mount (e.g. a configurable UID/PUID build arg, or an explicit permission fix step), so a report-directory write failure caused purely by ownership mismatch does not occur under normal use.
<!-- AC:END -->
