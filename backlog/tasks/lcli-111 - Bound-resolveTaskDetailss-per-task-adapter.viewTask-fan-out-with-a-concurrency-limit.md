---
id: LCLI-111
title: >-
  Bound resolveTaskDetails's per-task adapter.viewTask fan-out with a
  concurrency limit
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
- [x] #1 resolveTaskDetails caps the number of concurrent adapter.viewTask calls in flight (e.g. via the same mapWithConcurrency helper used by probeLiveness) instead of firing the full task-id list at once.
- [x] #2 A test with a fake/instrumented adapter and a task-id list larger than the new concurrency cap asserts the number of concurrently in-flight viewTask calls never exceeds the cap.
- [x] #3 resolveTaskDetails's existing no-throw / per-id ok:false-on-rejection behavior is preserved after adding the concurrency bound.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Move check.ts's private mapWithConcurrency worker-pool helper into reconcile-shared.ts (exported), since check.ts already imports from reconcile-shared.ts (no reverse import possible without a cycle). check.ts now imports mapWithConcurrency from ./reconcile-shared instead of defining its own copy.
2. Add a TASK_DETAILS_CONCURRENCY cap (8, mirroring check.ts's LIVENESS_CONCURRENCY) and rewrite resolveTaskDetails to drive adapter.viewTask calls through mapWithConcurrency instead of Promise.allSettled(...map(...)), catching per-id errors into the existing ok:false TaskResolution shape so the no-throw contract is unchanged.
3. Add a test in test/reconcile-shared.test.ts using an instrumented adapter (tracks concurrent-in-flight count via a counter + a manually-released gate) with a task-id list larger than the cap, asserting peak concurrency never exceeds TASK_DETAILS_CONCURRENCY, and that all results still resolve (ok:true/ok:false) correctly.
4. Verify: bun test test/reconcile-shared.test.ts, bun test test/check.test.ts, bun run typecheck, full bun test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test test/reconcile-shared.test.ts (18 pass, 0 fail, incl. 2 new LCLI-111 tests) + bun test test/check.test.ts (194 pass, 0 fail) + full bun test (1714 pass, 0 fail, no regressions) + bun run typecheck (clean) + bun run lint (4 pre-existing infos in unrelated test files, confirmed identical at base commit 19a3705 via git stash).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved check.ts's private mapWithConcurrency worker-pool helper into reconcile-shared.ts (exported) so both callers can share it without a circular import (check.ts already imports from reconcile-shared.ts). Added an exported TASK_DETAILS_CONCURRENCY=8 cap (mirroring check.ts's LIVENESS_CONCURRENCY) and rewrote resolveTaskDetails to drive adapter.viewTask calls through mapWithConcurrency instead of an unbounded Promise.allSettled(taskIds.map(...)) fan-out, catching per-id viewTask rejections/nulls into the same ok:false TaskResolution shape (no-throw contract unchanged). check.ts now imports mapWithConcurrency from ./reconcile-shared instead of defining its own copy; probeLiveness's own concurrency behavior is untouched. Added two tests in test/reconcile-shared.test.ts: one asserts peak concurrent viewTask calls never exceeds (and does reach) TASK_DETAILS_CONCURRENCY across 26 ids, the other confirms the no-throw/ok:false-on-rejection contract holds under the cap with a mix of rejected/null/successful results across 19 ids.
<!-- SECTION:FINAL_SUMMARY:END -->
