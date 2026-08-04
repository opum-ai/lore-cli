---
id: LCLI-177
title: >-
  lore link viewTask consumers do not verify returned id matches requested id
  (sibling of LCLI-122/125)
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - cmd-link
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 129500
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
LCLI-122 hardened resolveTaskDetails (`src/commands/reconcile-shared.ts`) to reject an adapter.viewTask result whose returned id does not match the requested id. The wave-3 integration review found the same latent bug remains in the other viewTask consumers, which still trust the returned detail id/title/status: resolveRollup (`src/commands/tasks.ts:144-158`, already tracked separately as LCLI-125) and lore link pre-write validation plus back-ref edit paths (`src/commands/link.ts:180`, `212`, `346`). A misbehaving or ambiguous adapter could attribute the wrong task data in `lore tasks` and `lore link`. This task covers the link.ts consumers; LCLI-125 covers resolveRollup. Same bug class as LCLI-122.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The lore link viewTask-consuming paths (pre-write validation and back-ref edit around `src/commands/link.ts:180`, `212`, `346`) verify the returned BacklogTaskDetail id matches the requested id case-insensitively (matching LCLI-122 discipline) and refuse to use a mismatched detail.
- [x] #2 A regression test drives a link path with a stubbed adapter returning a mismatched id and asserts the operation refuses rather than writing the wrong task data into the managed block or back-ref.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared verifiedViewTask(adapter, taskId) helper in src/commands/link.ts, mirroring reconcile-shared.ts's resolveTaskDetails (LCLI-122): call adapter.viewTask(taskId); if the returned detail's id doesn't case-insensitively match taskId, throw a LoreError(not_found) naming both ids rather than trusting it; a genuine null (task doesn't exist) still passes through unchanged.
2. Replace the 3 call sites named in the AC:
   - line 180 (runLink pre-write existence validation, Promise.allSettled over adapter.viewTask) -> verifiedViewTask; a mismatch surfaces through the existing rejected-settle handling as not_found, refusing the whole command before any write.
   - line 216 (runLink's fresh re-read inside the back-ref edit loop) -> verifiedViewTask; a mismatch is caught by runSequentially and reported as backRef: "failed" for that task, never used to compute desiredDocs/labels.
   - line 363 (removeBackRefs, shared by runUnlink) -> verifiedViewTask; a mismatch is reported as backRef: "failed" rather than silently "skipped" or used to compute a removal from another task's data.
   Do NOT touch moveBackRefs (line ~425, rename.ts's mover) - out of the AC's named scope (not one of the 3 line refs; rename.ts is a different command's consumer, and no sibling task currently tracks it - will flag as a follow-up gap in the final summary, not fix it here).
3. Add regression tests to test/link.test.ts mirroring the LCLI-122 style already in test/reconcile-shared.test.ts: a stubbed adapter whose viewTask always answers with a different task's detail, for (a) the pre-write validation path (link refuses, exit 3/not_found, no write, no edit call), (b) the back-ref edit path (task reported failed, not corrupted with the wrong task's documentation/labels), (c) unlink's removeBackRefs path (task reported failed, not silently skipped/removed).
4. Mutation-check: temporarily revert the src hunk, confirm the new test(s) fail, restore.
5. Run bun test (full suite) and bun run typecheck; record pass/fail counts.
6. Update the task: check both ACs, append notes, write final summary, mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added a private verifiedViewTask(adapter, taskId) helper in src/commands/link.ts mirroring reconcile-shared.ts's resolveTaskDetails (LCLI-122): calls adapter.viewTask(taskId) and throws LoreError(not_found) naming both the requested and resolved ids when detail.id doesn't case-insensitively match taskId; a genuine null (task doesn't exist) still passes through unchanged. Wired into the 3 call sites named in the AC: runLink's pre-write existence validation (line ~180, now surfaces a mismatch through the existing rejected-Promise.allSettled handling as not_found, refusing the whole command before any write), runLink's fresh re-read inside the back-ref edit loop (line ~216, a mismatch is caught by runSequentially and reported per-task as backRef:"failed" rather than being used to compute desiredDocs/labels), and removeBackRefs shared by runUnlink (line ~363, same treatment instead of silently returning "skipped"/"removed"). Did NOT touch moveBackRefs (~line 425, rename.ts's mover) - out of this task's named 3-line scope; same bug class remains there, flagging as a follow-up gap.

Added 3 regression tests to test/link.test.ts (new describe "lore link/unlink — viewTask identity verification (LCLI-177)"), each driving a stubbed adapter whose viewTask always answers with a different task's (LCLI-999) detail: (1) link's pre-write validation refuses before any doc write (not_found, doc file untouched, zero editTask calls); (2) link's back-ref edit path reports the task failed and makes zero editTask calls (never borrows LCLI-999's documentation); (3) unlink's removeBackRefs reports the task failed and makes zero editTask calls, while the independent doc-side tasks: removal still completes.

Mutation-checked: git-stashed the src/commands/link.ts hunk, re-ran test/link.test.ts - all 3 new tests failed with the exact expected wrong-shape errors (drift instead of not_found; "expected a LoreError, but runLink returned"; message missing "LCLI-999"), confirming they exercise the fix. Restored via git stash pop; re-ran - all 63 pass.

Verification: bun test test/link.test.ts -> 63 pass, 0 fail. Full suite: bun test -> 1751 pass, 0 fail across 46 files. bun run typecheck -> clean (tsc --noEmit, no output). bunx biome check src/commands/link.ts test/link.test.ts -> no findings. A live bun run src/cli.ts repro wasn't applicable: a real backlog binary cannot be coerced into returning a mismatched task id for a matching query, so (exactly as LCLI-122's own precedent) the stubbed-adapter unit tests are the correct and only meaningful proof of this AC.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a private verifiedViewTask() helper in src/commands/link.ts (mirroring LCLI-122's resolveTaskDetails discipline) that rejects an adapter.viewTask result whose returned id doesn't case-insensitively match the requested id, throwing LoreError(not_found) instead of trusting it. Wired into all 3 AC-named call sites: runLink's pre-write existence check, runLink's fresh re-read before the back-ref edit, and unlink's removeBackRefs. A mismatch now refuses the write/edit outright rather than silently borrowing another task's title/status/labels/documentation. moveBackRefs (rename.ts's mover, same file but outside this task's named scope) was deliberately left untouched - same bug class remains there as a follow-up gap.

Verification: 3 new regression tests in test/link.test.ts (pre-write refusal, back-ref-edit refusal, unlink-removal refusal), each driving a stubbed adapter returning a mismatched-id detail. Mutation-checked (reverted the src hunk via git stash, confirmed all 3 new tests fail with the expected wrong-shape errors, restored, confirmed pass). test/link.test.ts: 63 pass/0 fail. Full suite: bun test -> 1751 pass/0 fail across 46 files. bun run typecheck -> clean. bunx biome check on both changed files -> no findings.
<!-- SECTION:FINAL_SUMMARY:END -->
