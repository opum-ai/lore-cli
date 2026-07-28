---
id: LCLI-183
title: >-
  Guard moveBackRefs viewTask consumer + de-duplicate the id-mismatch check
  across link.ts/tasks.ts/reconcile-shared.ts
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - cmd-link
dependencies: []
priority: medium
type: bug
ordinal: 193000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Wave-7 integration-review follow-up (findings 1+2). LCLI-122 (resolveTaskDetails in src/commands/reconcile-shared.ts), LCLI-177 (verifiedViewTask in src/commands/link.ts), and LCLI-125 (inline in resolveRollup, src/commands/tasks.ts) now hold three byte-identical copies of the same viewTask id-mismatch guard (same comparison, same LoreError('not_found',...) type, byte-identical message + hint + {taskId, resolvedId} input). Two gaps:

1. GENUINE UNGUARDED 4TH CONSUMER (the medium reason): moveBackRefs (src/commands/link.ts:~432, called by src/commands/rename.ts) is a raw, unguarded adapter.viewTask consumer. It uses the returned detail's labels + documentation (link.ts:~444-461) to compute an editTask WRITE under the requested taskId — exactly the 'borrow another task's data while writing under the requested id' hazard class LCLI-177 guarded removeBackRefs against. A mismatched/ambiguous adapter detail here corrupts a task's documentation list during 'lore rename'. verifiedViewTask already returns null → 'already-current' compatibly, and moveBackRefs runs under runSequentially (link.ts:~835-848) which catches per-task throws into a 'failed' outcome, so wiring the guard in degrades gracefully.

2. TRIPLICATION: the check/message/hint exist in 3 hand-maintained places and will silently drift on the first single-site edit. tasks.ts already imports dedupeTaskIds/defaultAdapter from link.ts, so a shared helper (export verifiedViewTask, or hoist a taskIdMismatchError(taskId, resolvedId) factory next to resolveTaskDetails) is trivially reachable.

3. The verifiedViewTask doc comment (src/commands/link.ts:~501-503) is now factually false: it claims 'every one of this module's viewTask consumers' and enumerates 3, but the module has 4 (moveBackRefs is the 4th).

Found by the wave-7 integration review (2026-07-22); see doc-3 wave log. Not a regression from wave 7 — moveBackRefs was outside LCLI-177's cited scope (link.ts:180/212/346).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 moveBackRefs (link.ts) routes its adapter.viewTask result through the same id-mismatch guard as verifiedViewTask (case-insensitive id match; a mismatched detail is refused rather than used to compute the editTask write), and 'lore rename' surfaces the mismatch as a per-task failure instead of corrupting the doc list
- [x] #2 The id-mismatch check (comparison + LoreError type + message + hint + {taskId,resolvedId} input) exists in ONE shared place, consumed by link.ts's viewTask consumers and by resolveRollup in tasks.ts; the inline duplicate in tasks.ts is replaced by the shared helper with no behavior change (existing LORE-125 tasks.test.ts assertions still pass)
- [x] #3 The verifiedViewTask (or shared helper) doc comment accurately describes which consumers it covers (no longer claims 'every viewTask consumer' while omitting moveBackRefs)
- [x] #4 A regression test drives the rename/moveBackRefs path with a stubbed adapter returning a mismatched id and asserts the operation refuses rather than writing the wrong task's documentation into the back-ref; full suite + typecheck + biome remain green
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. link.ts: export verifiedViewTask; route moveBackRefs through it instead of a raw adapter.viewTask call (AC#1). 2. tasks.ts: import verifiedViewTask from link.ts; replace resolveRollup's inline id-mismatch check with it, removing the LCLI-125 duplicate (AC#2). 3. Fix verifiedViewTask's doc comment to list moveBackRefs and resolveRollup among its consumers instead of the stale 'every viewTask consumer' claim omitting moveBackRefs (AC#3). 4. Add a regression test in test/rename.test.ts driving runRename with a stubbed adapter whose viewTask always answers a mismatched task id carrying the old label/doc, asserting a per-task 'failed' outcome and zero editTask calls (AC#4). Verify with full bun test + typecheck + biome lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test → 1888 pass / 0 fail across 47 files (5330 expect() calls), including new AC#4 regression test in test/rename.test.ts and existing tasks.test.ts LCLI-125 assertions (unchanged, still pass). bun run typecheck (tsc --noEmit) → clean, no errors. bun run lint (biome check) → 3 pre-existing errors in test/supersede.test.ts, test/context.test.ts, test/replace.test.ts (unrelated files, confirmed identical to dev@ba2c12e via empty git diff — not touched by this task and out of my pinned scope); the files this task edited (src/commands/link.ts, src/commands/tasks.ts, test/rename.test.ts) have zero lint findings.

Fable review follow-up (request_changes, AC#2 gap): resolveTaskDetails in src/commands/reconcile-shared.ts still hand-maintained its own byte-identical copy of the id-mismatch check (LCLI-122's original), so the guard existed in TWO places (link.ts/tasks.ts's shared verifiedViewTask, plus reconcile-shared.ts's own inline branch) rather than the AC's ONE shared place. Fixed: resolveTaskDetails now calls verifiedViewTask(adapter, taskId) (import added from ./link) and the inline mismatch branch is deleted; the null-detail 'does not exist' branch is unchanged (still reconcile-specific). Behavior-preserving: verifiedViewTask throws the identical LoreError('not_found', same message/hint/{taskId,resolvedId}), caught by the surrounding try/catch and stored as {ok:false,error} exactly as before -- confirmed via the existing reconcile-shared.test.ts assertions (LCLI-122's mismatch tests, both in gatherReconciliation and resolveTaskDetails describe blocks) passing unchanged, no test edits needed. Updated the now-stale 'mirrors reconcile-shared.ts's resolveTaskDetails' wording in link.ts's verifiedViewTask doc comment and reconcile-shared.ts's own resolveTaskDetails doc comment to describe the delegation, plus tasks.ts's module docstring (which also referenced the old three-way relationship). Re-verified: bun test 1888 pass/0 fail (47 files, same count -- no new tests needed, existing coverage sufficient); bun run typecheck clean; bun run lint clean on src/commands/link.ts, tasks.ts, reconcile-shared.ts (the pre-existing 3 errors in test/supersede.test.ts, test/context.test.ts, test/replace.test.ts remain, confirmed 0-line diff vs dev tip ba2c12e -- Fable-flagged as repo-level baseline drift, out of this task's scope).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the genuine 4th unguarded viewTask consumer and de-duplicated the id-mismatch guard. link.ts: moveBackRefs now reads through the exported verifiedViewTask (was a raw adapter.viewTask call), so an adapter returning a mismatched-id detail is refused rather than used to compute the editTask write during lore rename — it surfaces as a per-task 'failed' outcome (drift exit 6), never a wrong-task documentation write. tasks.ts: resolveRollup's inline LCLI-125 copy of the comparison/LoreError('not_found')/message/hint/{taskId,resolvedId} check is replaced by the same shared verifiedViewTask export from link.ts (tasks.ts already imported dedupeTaskIds/defaultAdapter from it) — no behavior change, same exit code, same message shape. verifiedViewTask's doc comment no longer claims to cover 'every one of this module's viewTask consumers' while omitting moveBackRefs; it now names all four (link's pre-write check, the back-ref edit's fresh re-read, unlink's removal read, moveBackRefs's move read) plus its cross-module reuse by tasks.ts. Added a regression test in test/rename.test.ts driving runRename/moveBackRefs with a stubbed adapter that always answers a different task's detail (carrying the OLD label/doc, the shape an unguarded read would borrow) and asserts a 'failed' backRef outcome with zero editTask calls. Verified: bun test 1888 pass/0 fail (47 files); bun run typecheck clean; bun run lint clean on every file this task touched (3 unrelated pre-existing failures elsewhere, confirmed identical to dev@ba2c12e, out of scope).

Follow-up to Fable's request_changes: AC#2's 'ONE shared place' now genuinely holds across all three files named in the task title. reconcile-shared.ts's resolveTaskDetails was found still hand-maintaining its own copy of the id-mismatch check after the first pass (which only unified link.ts and tasks.ts) -- it now delegates to link.ts's exported verifiedViewTask exactly like tasks.ts's resolveRollup does, with the inline duplicate branch deleted. No behavior change (same LoreError type/message/hint/fields, same catch-and-store-as-ok:false outcome); doc comments in all three files updated to describe the real relationship instead of the stale 'mirrors' language. bun test 1888/0, typecheck clean, lint clean on every file this task touched.
<!-- SECTION:FINAL_SUMMARY:END -->
