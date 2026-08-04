---
id: LCLI-235
title: Bound resolveRollup's viewTask fan-out with the shared concurrency cap
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - cmd-meta-a
  - codex-review-followup
  - concurrency
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: bug
ordinal: 337000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/commands/tasks.ts`'s `resolveRollup` (tasks.ts:160) fans out one `backlog task view` subprocess per linked task id fully concurrently via `Promise.allSettled(linked.map((id) => verifiedViewTask(adapter, id)))`, with no concurrency cap. Its sibling `reconcile-shared.ts`'s `resolveTaskDetails` was bounded to `TASK_DETAILS_CONCURRENCY` (=8) in flight via the exported `mapWithConcurrency` worker-pool (reconcile-shared.ts:189-209, LCLI-111), but `resolveRollup` was not, so a concept whose `tasks:` list links many ids can spawn one Backlog CLI subprocess per id at once — the same process/file-descriptor exhaustion hazard LCLI-111 fixed. The existing in-order semantics must be preserved exactly: the first read that FAILS, in `tasks:` order, is rethrown before any partial rollup or advisory is emitted (tasks.ts:163-176), `null` (dangling) reads are dropped with a stderr advisory, and the `--status` filter is applied last. Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a; the reconcile-shared half of this same finding is already resolved by LCLI-111.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 resolveRollup runs at most TASK_DETAILS_CONCURRENCY viewTask/verifiedViewTask calls in flight at once, reusing the cap and the mapWithConcurrency helper already exported from reconcile-shared.ts rather than a hardcoded copy.
- [x] #2 Behavior is otherwise unchanged: linked-order preservation, first-failure-in-tasks:-order rethrown before any stdout/stderr output, dangling (null) ids dropped with the existing stderr advisory, and the --status filter applied last.
- [x] #3 A new test in test/tasks.test.ts asserts the peak in-flight viewTask count never exceeds TASK_DETAILS_CONCURRENCY (and saturates it) for a concept linking comfortably more than the cap's worth of tasks, mirroring reconcile-shared.test.ts's existing cap test.
- [x] #4 bun test is green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import mapWithConcurrency + TASK_DETAILS_CONCURRENCY from ./concurrency (canonical location post-LCLI-233), not reconcile-shared.ts. 2. In resolveRollup, replace the unbounded Promise.allSettled(linked.map(...)) fan-out with a bounded pass: run mapWithConcurrency over {id,index} pairs at TASK_DETAILS_CONCURRENCY, each worker catching its own verifiedViewTask outcome into a pre-sized settled[] array by index (fulfilled/rejected), preserving the exact same downstream in-order scan (first rejection in tasks: order rethrown before any output; null -> dangling advisory; --status filter applied last) unchanged. 3. Add a new AC#3 test in test/tasks.test.ts mirroring reconcile-shared.test.ts's cap test: an instrumented adapter tracking active/peak viewTask calls over TASK_DETAILS_CONCURRENCY*3+2 linked ids, asserting peak == TASK_DETAILS_CONCURRENCY and linked-order preserved in the result. 4. Verify: bun test test/tasks.test.ts, full bun test, whole-repo bun run typecheck, biome check on changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: tasks.ts now imports mapWithConcurrency + TASK_DETAILS_CONCURRENCY from ./concurrency (the canonical post-LCLI-233 location, not reconcile-shared.ts's re-export). resolveRollup's viewTask fan-out is bounded to TASK_DETAILS_CONCURRENCY (=8) in flight via a mapWithConcurrency worker-pool over {id,index} pairs, each worker catching verifiedViewTask's outcome into a pre-sized settled[] array by index so the existing downstream in-order scan (first-failure-in-tasks:-order rethrown before any stdout/stderr output; null/dangling dropped with the stderr advisory; --status filter applied last) is byte-for-byte unchanged. Added a new AC#3 test (test/tasks.test.ts, 'runTasks — resolveRollup's viewTask fan-out is bounded') mirroring reconcile-shared.test.ts:282-305: an instrumented adapter over TASK_DETAILS_CONCURRENCY*3+2=26 linked ids asserts peak in-flight viewTask calls == TASK_DETAILS_CONCURRENCY (saturates, never exceeds) and that linked-order is preserved in the rollup despite pooled scheduling. Verification: bun test test/tasks.test.ts -> 27 pass/0 fail (was 26 before the new test); full bun test -> 1973 pass/0 fail; whole-repo bun run typecheck -> clean (no import-cycle regression from tasks.ts -> ./concurrency); bunx biome check src/commands/tasks.ts test/tasks.test.ts -> no issues. Diff strictly confined to src/commands/tasks.ts + test/tasks.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Bounded resolveRollup's viewTask fan-out to the shared TASK_DETAILS_CONCURRENCY cap. tasks.ts now imports mapWithConcurrency + TASK_DETAILS_CONCURRENCY from the canonical ./concurrency module (post-LCLI-233 relocation), not reconcile-shared.ts's back-compat re-export, and no cap/pool copy is hardcoded. resolveRollup's fan-out runs a mapWithConcurrency worker-pool over {id,index} pairs at TASK_DETAILS_CONCURRENCY (=8) in flight, writing each verifiedViewTask outcome into a pre-sized settled[] array by index; the existing downstream logic (first-failure-in-tasks:-order rethrown before any output, dangling null ids dropped with the stderr advisory, --status filter applied last, linked-order preserved) is unchanged. Added a peak-in-flight saturation test in test/tasks.test.ts (26 linked ids, well over the cap) mirroring reconcile-shared.test.ts's own LCLI-111 cap test. Verified: bun test test/tasks.test.ts 27 pass/0 fail; full bun test 1973 pass/0 fail; whole-repo bun run typecheck clean (no import cycle); bunx biome check on both changed files clean. Diff confined to src/commands/tasks.ts + test/tasks.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->
