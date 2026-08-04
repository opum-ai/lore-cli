---
id: LORE-125
title: resolveRollup doesn't verify viewTask's returned id matches the requested id
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 18:04'
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
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/commands/tasks.ts, resolveRollup (line 158) builds each TaskRollupRow directly from result.value.id/title/status with no comparison against linked[i], the id that was actually requested at that position. If adapter.viewTask ever returns a detail for a different task than requested, the rollup would silently attribute another task's title/status to the requested row, with no check anywhere else in resolveRollup (lines 133-165) to catch it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 resolveRollup treats a BacklogTaskDetail whose id does not case-insensitively match the requested linked[i] id as a hard failure (thrown error) rather than pushing it into rows.
- [x] #2 A regression test in test/tasks.test.ts uses a stub adapter whose viewTask returns a detail with a mismatched id, asserting the mismatch is surfaced as an error rather than silently included in the rollup.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In resolveRollup (src/commands/tasks.ts), after a fulfilled non-null viewTask result, compare result.value.id (case-insensitively) against linked[i], the id actually requested at that position. 2. On mismatch, throw a LoreError('not_found', ...) mirroring reconcile-shared.ts's resolveTaskDetails (LORE-122's fix for the same class of bug), instead of pushing the row. 3. Add a regression test in test/tasks.test.ts using a stub adapter whose viewTask always returns a different task's detail; assert the mismatch surfaces as a thrown not_found LoreError naming both ids, not a silently wrong rollup row. 4. Update the module/function docstrings to document the new hard-failure branch.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed resolveRollup (src/commands/tasks.ts): after a fulfilled non-null viewTask result, compares result.value.id case-insensitively against linked[i] (the id actually requested at that position); mismatch throws LoreError('not_found', ...) naming both ids, mirroring reconcile-shared.ts's resolveTaskDetails fix for the identical bug class (LORE-122). Added regression test in test/tasks.test.ts with a stub adapter whose viewTask always returns a different task's detail (LORE-999 for a request of LORE-1); asserts a thrown not_found LoreError naming both ids instead of a silently wrong row. Mutation-checked: reverted the throw hunk, confirmed exactly that new test failed (23 pass/1 fail), restored, reconfirmed green. Verification: bun test -> 1749 pass / 0 fail across 46 files; bun run typecheck -> clean; real CLI repro (bun run src/cli.ts tasks adr/0009-story-task-coupling-reconciliation --json) confirms the normal (non-mismatch) path still works end-to-end, exit 0. A real-CLI repro of the mismatch itself is not meaningful (the real backlog binary never misreports a task's own id under a correct request -- this is a defensive check against adapter bugs/id collisions), same as LORE-122's precedent, so the stub-adapter unit test is the correct and only sensible proof for AC#2.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
resolveRollup now hard-fails (thrown not_found LoreError) when a viewTask detail's own id disagrees case-insensitively with the requested linked[i] id, instead of silently pushing the mismatched detail into the rollup as that row. Mirrors reconcile-shared.ts's resolveTaskDetails guard (LORE-122) for the identical bug class. Verified: bun test 1749 pass/0 fail; bun run typecheck clean; new regression test in test/tasks.test.ts mutation-checked (fails without the fix, passes with it); real CLI smoke confirms no regression to the normal path.
<!-- SECTION:FINAL_SUMMARY:END -->
