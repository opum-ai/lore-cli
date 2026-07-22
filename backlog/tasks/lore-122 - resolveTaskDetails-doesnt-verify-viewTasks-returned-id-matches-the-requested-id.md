---
id: LORE-122
title: >-
  resolveTaskDetails doesn't verify viewTask's returned id matches the requested
  id
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 13:49'
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
- [x] #1 resolveTaskDetails treats a BacklogTaskDetail whose id does not case-insensitively match the requested taskId as a resolution failure (ok: false with a descriptive LoreError) instead of storing it as ok: true.
- [x] #2 A regression test in test/reconcile-shared.test.ts uses a stub adapter whose viewTask returns a detail with a mismatched id, asserting the mismatch surfaces as an error rather than being silently persisted into the reconciliation result.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In resolveTaskDetails (src/commands/reconcile-shared.ts), after a successful adapter.viewTask() call, compare detail.id.toLowerCase() to the requested taskId.toLowerCase(); on mismatch, store an ok:false TaskResolution with a descriptive not_found LoreError (mirrors the existing null-detail not_found branch) instead of ok:true.
2. Update resolveTaskDetails' and gatherReconciliation's doc comments to describe the new identity-check failure mode.
3. Add regression tests in test/reconcile-shared.test.ts: (a) unit-level resolveTaskDetails test with a stub adapter whose viewTask returns a mismatched-id detail, asserting ok:false + LoreError; (b) a same-case-insensitive-id-still-ok control test; (c) an integration-level gatherReconciliation test confirming the mismatch surfaces as a thrown error rather than being persisted into a ReconcileTarget's rows.
4. Run bun run typecheck and bun test (full suite) and record pass/fail counts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: resolveTaskDetails now compares the resolved BacklogTaskDetail.id (lowercased) to the requested taskId; a mismatch is stored as ok:false with a not_found LoreError (mirrors the existing null-detail branch) instead of ok:true. Added 3 tests to test/reconcile-shared.test.ts: unit-level mismatch, a same-id-different-case control (still ok:true), and an integration-level gatherReconciliation test confirming the mismatch surfaces as a thrown error rather than a silently-persisted wrong row. Verified: bun run typecheck clean; bun test full suite 1721 pass / 0 fail (target file: 21 pass / 0 fail); bun run lint clean on both touched source files (4 pre-existing infos elsewhere, unrelated).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
resolveTaskDetails (src/commands/reconcile-shared.ts) now checks the resolved BacklogTaskDetail.id against the requested taskId case-insensitively; a mismatch is stored as ok:false with a descriptive not_found LoreError instead of ok:true, closing the silent-corruption path into a concept's managed tasks: block. Added regression coverage in test/reconcile-shared.test.ts (mismatched-id -> ok:false with LoreError naming both ids; same-id-different-case control still ok:true; gatherReconciliation integration test proving the mismatch surfaces as a thrown error, not a persisted wrong row). Verified: bun run typecheck clean (tsc --noEmit, no errors); bun test full suite 1721 pass / 0 fail across 45 files (test/reconcile-shared.test.ts alone: 21 pass / 0 fail); bun run lint clean on both touched files.
<!-- SECTION:FINAL_SUMMARY:END -->
