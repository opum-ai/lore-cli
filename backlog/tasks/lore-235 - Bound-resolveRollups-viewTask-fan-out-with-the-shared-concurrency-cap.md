---
id: LORE-235
title: Bound resolveRollup's viewTask fan-out with the shared concurrency cap
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-meta-a
  - codex-review-followup
  - concurrency
dependencies: []
priority: low
type: bug
ordinal: 337000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`src/commands/tasks.ts`'s `resolveRollup` (tasks.ts:160) fans out one `backlog task view` subprocess per linked task id fully concurrently via `Promise.allSettled(linked.map((id) => verifiedViewTask(adapter, id)))`, with no concurrency cap. Its sibling `reconcile-shared.ts`'s `resolveTaskDetails` was bounded to `TASK_DETAILS_CONCURRENCY` (=8) in flight via the exported `mapWithConcurrency` worker-pool (reconcile-shared.ts:189-209, LORE-111), but `resolveRollup` was not, so a concept whose `tasks:` list links many ids can spawn one Backlog CLI subprocess per id at once — the same process/file-descriptor exhaustion hazard LORE-111 fixed. The existing in-order semantics must be preserved exactly: the first read that FAILS, in `tasks:` order, is rethrown before any partial rollup or advisory is emitted (tasks.ts:163-176), `null` (dangling) reads are dropped with a stderr advisory, and the `--status` filter is applied last. Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a; the reconcile-shared half of this same finding is already resolved by LORE-111.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveRollup runs at most TASK_DETAILS_CONCURRENCY viewTask/verifiedViewTask calls in flight at once, reusing the cap and the mapWithConcurrency helper already exported from reconcile-shared.ts rather than a hardcoded copy.
- [ ] #2 Behavior is otherwise unchanged: linked-order preservation, first-failure-in-tasks:-order rethrown before any stdout/stderr output, dangling (null) ids dropped with the existing stderr advisory, and the --status filter applied last.
- [ ] #3 A new test in test/tasks.test.ts asserts the peak in-flight viewTask count never exceeds TASK_DETAILS_CONCURRENCY (and saturates it) for a concept linking comfortably more than the cap's worth of tasks, mirroring reconcile-shared.test.ts's existing cap test.
- [ ] #4 bun test is green.
<!-- AC:END -->
