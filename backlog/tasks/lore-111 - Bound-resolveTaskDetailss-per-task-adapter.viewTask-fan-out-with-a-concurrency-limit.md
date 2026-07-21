---
id: LORE-111
title: >-
  Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a
  concurrency limit
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 125000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
resolveSharedReconciliation (src/commands/check.ts:378-403) calls `resolveTaskDetails(adapter, allTaskIds)`, which at src/commands/reconcile-shared.ts:188-192 runs `Promise.allSettled(taskIds.map((id) => adapter.viewTask(id)))` — spawning one Backlog CLI subprocess per distinct linked task id fully concurrently, with no worker-pool cap. This is inconsistent with probeLiveness's explicit `mapWithConcurrency(uniqueUrls, LIVENESS_CONCURRENCY, ...)` at check.ts:771, and a bundle with a large number of distinct `tasks:`-linked ids will spawn that many concurrent Backlog subprocesses at once, which can exhaust process/file-descriptor limits or overwhelm the Backlog CLI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveTaskDetails caps the number of concurrent adapter.viewTask calls in flight (e.g. via the same mapWithConcurrency helper used by probeLiveness) instead of firing the full task-id list at once.
- [ ] #2 A test with a fake/instrumented adapter and a task-id list larger than the new concurrency cap asserts the number of concurrently in-flight viewTask calls never exceeds the cap.
- [ ] #3 resolveTaskDetails's existing no-throw / per-id ok:false-on-rejection behavior is preserved after adding the concurrency bound.
<!-- AC:END -->
