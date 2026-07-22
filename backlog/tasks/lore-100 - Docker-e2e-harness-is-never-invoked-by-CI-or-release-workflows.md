---
id: LORE-100
title: Docker e2e harness is never invoked by CI or release workflows
status: In Progress
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 15:14'
labels:
  - codex-review-followup
  - build-ci-config
dependencies:
  - LORE-176
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 114000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The ~1500-line Docker e2e test harness under docker/e2e/ (docker-compose.yml, Dockerfile, run-e2e.sh) is not referenced anywhere in .github/workflows/ci.yml or release.yml — grepping both workflow files for `docker`/`e2e` returns zero matches. This means the harness provides no actual merge or release gate: a change can break every scenario it covers (LORE-61 through LORE-68 all added coverage/assertions inside the harness) and still merge or release cleanly, since nothing in CI runs it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 ci.yml (or release.yml, whichever is the intended gate) contains a job that builds and runs docker/e2e/docker-compose.yml (via run-e2e.sh or equivalent) on relevant PRs/pushes
- [ ] #2 That job is a required check — a failing e2e scenario fails the workflow run, not just a log warning
- [ ] #3 A deliberately broken e2e scenario (e.g. reverting an assertion added in LORE-61..68) is demonstrated to fail the new CI job
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
HELD pre-merge (wave 3, 2026-07-22). Impl complete + Fable-APPROVED (all 3 ACs confirmed; PUID/PGID + timeout fixes verified end-to-end via a real local Docker run; scope exact). Branch feature/LORE-100 @ 89f8133 pushed; worktree kept at /Volumes/external/repos/lore.worktrees/LORE-100 — do NOT re-implement; MERGE once unblocked. USER DECISION 2026-07-22: WIRE THE GATE. Next restore: (1) land LORE-176 (fix stale run-e2e.sh:1298 assertion vs LORE-89), (2) verify the full harness green via a real `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` run (0 failed scenarios), (3) rebase + re-verify + merge this held branch. Dep LORE-176. See tracker doc-3 wave-3 log.
<!-- SECTION:NOTES:END -->
