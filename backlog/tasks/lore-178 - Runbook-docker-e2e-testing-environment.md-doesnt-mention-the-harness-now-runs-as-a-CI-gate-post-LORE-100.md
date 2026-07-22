---
id: LORE-178
title: >-
  Runbook docker-e2e-testing-environment.md doesn't mention the harness now runs
  as a CI gate (post-LORE-100)
status: To Do
assignee: []
created_date: '2026-07-22 16:01'
labels:
  - codex-review-followup
  - build-ci-config
dependencies: []
ordinal: 188000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-4 integration review (LORE-100 wiring docker/e2e into CI) found docs/runbooks/docker-e2e-testing-environment.md still reads as local-only: its Purpose/Prerequisites describe hand-running the harness with Docker Desktop and never mention that CI now runs it on every PR/push (the new docker-e2e job in .github/workflows/ci.yml, added by LORE-100). ci.yml:133's own comment already refers to the runbook in the past tense ('previously runnable only by hand'), so the two are out of sync. Add a short section noting the harness now runs as the 'docker-e2e' CI job and that the structured results are uploaded as the 'docker-e2e-report' build artifact. Drive the edit through the lore CLI per repo convention (managed blocks / Story-Task coupling), not a plain editor.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The runbook states the docker/e2e harness now runs automatically as the 'docker-e2e' CI job (ci.yml) on the workflow's PR/push triggers, in addition to the existing manual local-run instructions
- [ ] #2 The runbook notes the CI job uploads docker/e2e/results/report.jsonl as the 'docker-e2e-report' artifact for triage
- [ ] #3 The edit was made via the lore CLI (managed blocks / cross-links stay coherent), and 'lore check' passes clean on the docs bundle afterward
<!-- AC:END -->
