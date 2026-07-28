---
id: LCLI-233
title: >-
  Bound runLink's up-front viewTask existence-check fan-out with a concurrency
  limit
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
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

**Why (provenance):** doc-2 (Codex second-opinion review) low-severity finding, cmd-link cluster. This is the identical defect LCLI-111 (Done) already fixed for the sibling read path `resolveTaskDetails` in `src/commands/reconcile-shared.ts`, which now drives its reads through the exported bounded helper `mapWithConcurrency` + `TASK_DETAILS_CONCURRENCY = 8` (`src/commands/reconcile-shared.ts:189-259`). LCLI-111 scoped itself to `check.ts`/`reconcile-shared.ts` and deliberately did not touch `link.ts`; `reconcile-shared.ts:264` even notes it "mirrors commands/link.ts's up-front validation exactly, including running the reads concurrently (`allSettled`)" — i.e. link.ts is the still-unbounded twin.

**Import-cycle caveat for the implementer:** `reconcile-shared.ts:23` already imports `verifiedViewTask`/`dedupeTaskIds`/`defaultAdapter` FROM `link.ts`, so having `link.ts` import `mapWithConcurrency` back from `reconcile-shared.ts` would create a `link → reconcile-shared → link` cycle. Prefer relocating the pure `mapWithConcurrency` helper (and, if desired, `TASK_DETAILS_CONCURRENCY`) into a neutral module both can import, or add an equivalent bounded loop local to link.ts — the helper has no dependency on either file's exports.

**Related sibling (may fold in or defer):** `src/commands/tasks.ts:160` `resolveRollup` has the identical unbounded `Promise.allSettled(linked.map((id) => verifiedViewTask(adapter, id)))` pattern; it belongs to the cmd-tasks cluster and can be addressed here or in its own follow-up.

Low priority because `lore link`'s task-id count is bounded by CLI arguments (human-typed), so realistic fan-out is smaller than `lore check`'s full-bundle sweep — but the same unbounded-subprocess hazard the project already chose to bound elsewhere.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 runLink's up-front task-existence validation (currently `Promise.allSettled(taskIds.map((taskId) => verifiedViewTask(adapter, taskId)))` at src/commands/link.ts:182) caps the number of concurrent verifiedViewTask/adapter.viewTask calls in flight (e.g. via the existing mapWithConcurrency helper + a shared concurrency cap) instead of firing the entire task-id list at once.
- [x] #2 The mapWithConcurrency helper is shared without introducing a link.ts -> reconcile-shared.ts import cycle (relocate the pure helper to a neutral module, or use an equivalent bounded loop), since reconcile-shared.ts already imports verifiedViewTask/dedupeTaskIds/defaultAdapter from link.ts.
- [x] #3 A test with an instrumented adapter (peak-in-flight counter + a released gate) and a task-id list larger than the cap asserts peak concurrent in-flight viewTask calls never exceeds the cap.
- [x] #4 runLink's existing behavior is preserved: the FIRST invalid id in argument order is still what gets reported (a not-found id throws LoreError not_found / exit 3; a rejected or id-mismatched read is reported identically), and a valid multi-id `lore link` still succeeds and writes all back-references.
- [x] #5 Verify: bun test test/link.test.ts, bun run typecheck, and the full bun test suite all pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Relocate the pure mapWithConcurrency helper + TASK_DETAILS_CONCURRENCY (=8) cap from reconcile-shared.ts into a new neutral module src/commands/concurrency.ts (no imports from link.ts or reconcile-shared.ts, avoiding the link<->reconcile-shared cycle). 2. reconcile-shared.ts imports both from ./concurrency and re-exports them unchanged so check.ts and reconcile-shared.test.ts (existing importers) keep working with zero code changes elsewhere -- resolveTaskDetails's body is untouched. 3. link.ts imports mapWithConcurrency + TASK_DETAILS_CONCURRENCY from ./concurrency and replaces runLink's Promise.allSettled(taskIds.map(...)) up-front existence-check fan-out with a bounded mapWithConcurrency call over {taskId,index} pairs, writing each PromiseSettledResult into detailResults by ORIGINAL index (not push order) so the existing in-order first-invalid-id scan is untouched and behaves identically. 4. Add tests to test/link.test.ts: an instrumented-adapter peak-in-flight/gate test proving the pool caps at and saturates TASK_DETAILS_CONCURRENCY while a valid multi-id link still writes every back-reference, plus a first-invalid-id-in-argument-order regression test at a fan-out larger than the cap. 5. Verify with bun test test/link.test.ts, whole-repo bun run typecheck, and the full bun test suite.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented. Verified: bun test test/link.test.ts -> 69 pass/0 fail; whole-repo bun test -> 1961 pass/0 fail (47 files); bun run typecheck -> clean (tsc --noEmit, no output); bunx biome check on the 4 changed files -> no errors. New test 'never runs more than TASK_DETAILS_CONCURRENCY viewTask calls in flight, saturates the cap, and a valid multi-id link still writes every back-reference (AC#1/#3/#4)' uses an instrumented adapter with a peak-in-flight counter + a manually-released gate over TASK_DETAILS_CONCURRENCY*3+2=26 ids: asserts peak<=cap AND peak===cap (saturates), then asserts the link succeeds with all 26 tasks 'added'/'added' and adapter.calls.length===26 (every back-reference written). A second new test confirms the first-invalid-id-in-argument-order contract still holds under a fan-out (19 ids) larger than the cap. reconcile-shared.ts's own resolveTaskDetails/gatherReconciliation logic is byte-identical (only its mapWithConcurrency/TASK_DETAILS_CONCURRENCY import source changed, both re-exported for check.ts and reconcile-shared.test.ts); ran test/reconcile-shared.test.ts + test/check.test.ts explicitly alongside test/link.test.ts (302 pass/0 fail) to confirm no regression. No link<->reconcile-shared import cycle: verified via tsc --noEmit succeeding and by inspection (src/commands/concurrency.ts has zero imports from either file).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
runLink's up-front task-existence check (src/commands/link.ts) no longer fires one verifiedViewTask/adapter.viewTask call per task id via an unbounded Promise.allSettled(taskIds.map(...)); it now runs through mapWithConcurrency bounded to TASK_DETAILS_CONCURRENCY (=8) in flight at once, writing each settled outcome into detailResults by original index so the existing in-order first-invalid-id-in-argument-order scan (and its behavior) is unchanged. The pure mapWithConcurrency helper and TASK_DETAILS_CONCURRENCY cap were relocated out of reconcile-shared.ts into a new neutral module, src/commands/concurrency.ts (zero imports from link.ts or reconcile-shared.ts), avoiding a link -> reconcile-shared -> link import cycle since reconcile-shared.ts already imports verifiedViewTask/dedupeTaskIds/defaultAdapter from link.ts. reconcile-shared.ts now just imports both symbols from ./concurrency and re-exports them unchanged, so check.ts and reconcile-shared.test.ts (its existing importers) needed zero changes and resolveTaskDetails's own logic is untouched. Verified: bun test test/link.test.ts (69 pass/0 fail), the full bun test suite (1961 pass/0 fail across 47 files), whole-repo bun run typecheck (clean), and bunx biome check on all four changed files (no errors). New tests in test/link.test.ts prove the pool caps at and saturates TASK_DETAILS_CONCURRENCY (instrumented-adapter peak-in-flight counter + a manually-released gate, 26 ids) while a valid multi-id lore link still writes every back-reference, and that the first-invalid-id-in-argument-order contract holds at a fan-out (19 ids) larger than the cap.
<!-- SECTION:FINAL_SUMMARY:END -->
