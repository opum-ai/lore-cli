---
id: LORE-122
title: >-
  resolveTaskDetails doesn't verify viewTask's returned id matches the requested
  id
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 136000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/commands/reconcile-shared.ts, resolveTaskDetails (line 213) stores the BacklogTaskDetail returned by adapter.viewTask(taskId) into the resolved map keyed by the requested taskId, without ever comparing result.value.id to taskId. If the adapter ever returns a detail for a different task than requested, lore sync/check would silently attribute the wrong task's title/status to a concept's tasks: link, corrupting the managed task block that gets written into the docs bundle. No identity check exists anywhere else in gatherReconciliation (lines 140-178) either, so nothing downstream would catch the mismatch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveTaskDetails treats a BacklogTaskDetail whose id does not case-insensitively match the requested taskId as a resolution failure (ok: false with a descriptive LoreError) instead of storing it as ok: true.
- [ ] #2 A regression test in test/reconcile-shared.test.ts uses a stub adapter whose viewTask returns a detail with a mismatched id, asserting the mismatch surfaces as an error rather than being silently persisted into the reconciliation result.
<!-- AC:END -->
