---
id: LORE-106
title: Golden recorder trusts a live mutable task and an unverified upstream CLI path
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
ordinal: 120000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
record-backlog-goldens.ts:44 defaults `TASK_VIEW_ID` to `"LORE-33"`, a real, mutable task living in this repo's own `backlog/`, so if that task's fields ever change for unrelated reasons, a future golden-regeneration run would silently bake that drift into the committed `task-view.json` golden and misattribute it to an upstream contract change. Separately, lines 50-51 resolve `UPSTREAM_CLI` from the `LORE_BACKLOG_UPSTREAM_CLI` env var (default `~/repos/Backlog.md-upstream/src/cli.ts`) with no check anywhere in the file that the resolved binary's checked-out commit matches the pinned `BACKLOG_COMMIT` (`22a091b...`) documented in docker/e2e/Dockerfile, so goldens could be regenerated against an unpinned or mismatched upstream revision without warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Before writing goldens, the script verifies the resolved `UPSTREAM_CLI`'s checked-out commit against the pinned `BACKLOG_COMMIT`, and aborts with a clear error (instead of writing goldens) when they don't match.
- [ ] #2 The script validates that the fetched `TASK_VIEW_ID` specimen still matches its documented shape (Done status, plan, notes, two acceptance criteria, dependencies, documentation, null finalSummary) before writing the golden, and fails loudly if the live task no longer matches that shape.
<!-- AC:END -->
