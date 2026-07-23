---
id: LORE-233
title: >-
  Bound runLink's up-front viewTask existence-check fan-out with a concurrency
  limit
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-link
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 335000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** `lore link`'s up-front task-existence validation should cap how many `adapter.viewTask` Backlog subprocesses it spawns at once, instead of firing one per task id fully concurrently.

**Live location:** `src/commands/runLink` at `src/commands/link.ts:182`:
```ts
const detailResults = await Promise.allSettled(taskIds.map((taskId) => verifiedViewTask(adapter, taskId)));
```
Each `verifiedViewTask` → `adapter.viewTask` spawns a `backlog task view` subprocess (`defaultAdapter` → `createBacklogAdapter(bunBacklogSpawn(...))`). The `.map` starts them all simultaneously with no worker-pool bound, so `lore link <id>` with a large task-id list spawns that many concurrent Backlog subprocesses at once (potential process/file-descriptor exhaustion).

**Why (provenance):** doc-2 (Codex second-opinion review) low-severity finding, cmd-link cluster. This is the identical defect LORE-111 (Done) already fixed for the sibling read path `resolveTaskDetails` in `src/commands/reconcile-shared.ts`, which now drives its reads through the exported bounded helper `mapWithConcurrency` + `TASK_DETAILS_CONCURRENCY = 8` (`src/commands/reconcile-shared.ts:189-259`). LORE-111 scoped itself to `check.ts`/`reconcile-shared.ts` and deliberately did not touch `link.ts`; `reconcile-shared.ts:264` even notes it "mirrors commands/link.ts's up-front validation exactly, including running the reads concurrently (`allSettled`)" — i.e. link.ts is the still-unbounded twin.

**Import-cycle caveat for the implementer:** `reconcile-shared.ts:23` already imports `verifiedViewTask`/`dedupeTaskIds`/`defaultAdapter` FROM `link.ts`, so having `link.ts` import `mapWithConcurrency` back from `reconcile-shared.ts` would create a `link → reconcile-shared → link` cycle. Prefer relocating the pure `mapWithConcurrency` helper (and, if desired, `TASK_DETAILS_CONCURRENCY`) into a neutral module both can import, or add an equivalent bounded loop local to link.ts — the helper has no dependency on either file's exports.

**Related sibling (may fold in or defer):** `src/commands/tasks.ts:160` `resolveRollup` has the identical unbounded `Promise.allSettled(linked.map((id) => verifiedViewTask(adapter, id)))` pattern; it belongs to the cmd-tasks cluster and can be addressed here or in its own follow-up.

Low priority because `lore link`'s task-id count is bounded by CLI arguments (human-typed), so realistic fan-out is smaller than `lore check`'s full-bundle sweep — but the same unbounded-subprocess hazard the project already chose to bound elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 runLink's up-front task-existence validation (currently `Promise.allSettled(taskIds.map((taskId) => verifiedViewTask(adapter, taskId)))` at src/commands/link.ts:182) caps the number of concurrent verifiedViewTask/adapter.viewTask calls in flight (e.g. via the existing mapWithConcurrency helper + a shared concurrency cap) instead of firing the entire task-id list at once.
- [ ] #2 The mapWithConcurrency helper is shared without introducing a link.ts -> reconcile-shared.ts import cycle (relocate the pure helper to a neutral module, or use an equivalent bounded loop), since reconcile-shared.ts already imports verifiedViewTask/dedupeTaskIds/defaultAdapter from link.ts.
- [ ] #3 A test with an instrumented adapter (peak-in-flight counter + a released gate) and a task-id list larger than the cap asserts peak concurrent in-flight viewTask calls never exceeds the cap.
- [ ] #4 runLink's existing behavior is preserved: the FIRST invalid id in argument order is still what gets reported (a not-found id throws LoreError not_found / exit 3; a rejected or id-mismatched read is reported identically), and a valid multi-id `lore link` still succeeds and writes all back-references.
- [ ] #5 Verify: bun test test/link.test.ts, bun run typecheck, and the full bun test suite all pass.
<!-- AC:END -->
