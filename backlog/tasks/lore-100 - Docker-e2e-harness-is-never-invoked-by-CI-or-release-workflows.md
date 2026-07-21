---
id: LORE-100
title: Docker e2e harness is never invoked by CI or release workflows
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - build-ci-config
dependencies: []
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
