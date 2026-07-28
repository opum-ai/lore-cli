---
id: LCLI-116
title: lore replace commit phase has no atomic write or rollback on partial failure
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - cmd-crud-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 130000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runReplace() (src/commands/replace.ts:132-137), the Phase-2 commit loop writes each planned file via writeFileOverwriting() (src/commands/fswrite.ts:168-174), a plain non-atomic writeFileSync with no temp-file/rename step, and the loop performs no rollback if a write fails partway through. If `lore replace` is writing N matched files and the process crashes, is killed, or hits an I/O error (e.g. disk full, permissions) after writing some but not all planned files, the bundle is left with a mix of replaced and un-replaced files and no way to undo the ones already written — unlike `lore sync`, which uses the atomic writeFileAtomic() (temp file + renameSync) specifically to avoid leaving a destination file half-written.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A write failure partway through the Phase-2 commit loop in runReplace no longer leaves any single target file truncated or half-written (each file write is atomic, e.g. via writeFileAtomic's temp-file+rename discipline).
- [x] #2 A regression test simulates a write failure on one of several planned files (e.g. by mocking/stubbing the write call to throw partway through) and asserts that files written before the failure are intact (not truncated) and the error surfaces rather than being silently swallowed.
- [x] #3 Existing `lore replace` dry-run and successful multi-file replace behavior (report contents, exit code) is unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Swap the Phase-2 commit loop in runReplace() (src/commands/replace.ts) from writeFileOverwriting to the existing writeFileAtomic (temp-file+rename discipline, src/commands/fswrite.ts), so a crash/kill/I-O error partway through a single file's write can never leave it truncated or half-written -- reusing lore sync's proven primitive rather than inventing a new one.
2. Update the surrounding docstrings in fswrite.ts and replace.ts to reflect that replace now also uses writeFileAtomic (not just sync), and that this is per-file atomicity only (no cross-file rollback, matching writeAllOrRollback's own documented deferral of that broader concern).
3. Add a regression test in test/replace.test.ts: stub node:fs's writeFileSync (via bun:test spyOn on a namespace import, forwarding non-failing calls to the real implementation) to throw on the second of three planned files' writes, and assert the first file committed, the failing file's original bytes are untouched (not truncated), the third file was never reached, the error surfaces (not swallowed), and no stray .lore-sync-tmp-* file is left behind.
4. Verify: bun run typecheck and bun test (full suite) both pass; confirm existing dry-run/multi-file replace tests are unaffected (AC#3).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: replace.ts's Phase-2 commit loop now calls writeFileAtomic instead of writeFileOverwriting (temp-file+renameSync, same discipline lore sync already uses). Updated fswrite.ts and replace.ts docstrings to reflect the shared caller and the per-file-only atomicity scope (no cross-file rollback -- that stays a separate, deferred concern per writeAllOrRollback's own docs).

Test: test/replace.test.ts, new describe block 'lore replace — commit-phase write atomicity (LCLI-116)'. Writes a.md/b.md/c.md, spies on node:fs writeFileSync (bun:test spyOn on a namespace import) to throw on the 2nd call, forwarding all other calls to the real implementation. Asserts: a.md committed with new content; b.md keeps its ORIGINAL bytes (temp write failed before touching the destination -- not truncated); c.md never reached; runReplace's error is not swallowed (throws); no stray .lore-sync-tmp-* file left in docs/.

Verification: bun run typecheck -> clean (tsc --noEmit, no errors). bun test (full suite) -> 1719 pass, 0 fail, 4844 expect() calls, across 45 files. bun run lint -> 0 errors (4 pre-existing infos in unrelated files, out of scope). Existing replace dry-run/multi-file success tests (report contents, exit code) all still pass unmodified, confirming AC#3.

Fable review follow-up: the original AC#2 regression test had zero discrimination power -- it also passed empirically against writeFileOverwriting reverted in a scratch copy (1 pass/0 fail), because the spy throws before any real write regardless of implementation and none of the original assertions inspected which path was actually targeted. Strengthened test/replace.test.ts to record every spied writeFileSync call's path argument and add three discriminating assertions: exactly 2 calls occur (a.md's real write, b.md's failing write; c.md never attempted); the failing 2nd call's basename starts with '.lore-sync-tmp-' (proving the commit-phase write goes through writeFileAtomic's temp-file discipline, not a direct write); and join(root, 'docs/b.md') never appears as a writeFileSync destination. Mutation-checked: reverted replace.ts to writeFileOverwriting in a scratch copy outside the worktree -- the strengthened test now fails there (0 pass/1 fail on the exact assertion added), confirming it catches a reversion of the one-line fix. Re-verified in the real worktree after strengthening: bun run typecheck clean; bun test 1719 pass/0 fail/4847 expect() calls across 45 files (test/replace.test.ts 76 pass/0 fail); bun run lint 0 errors (4 pre-existing infos, unrelated files).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Phase-2 commit loop in runReplace() (src/commands/replace.ts) now writes each planned file via writeFileAtomic (temp-file+renameSync) instead of the plain writeFileOverwriting, so a crash/kill/I-O error partway through a single file's write can never leave it truncated or half-written -- matching lore sync's existing discipline. Added a regression test (test/replace.test.ts) that stubs writeFileSync to fail on the 2nd of 3 planned files and verifies the earlier file committed, the failing file's original bytes are intact, the later file was never touched, the error surfaces, and no stray temp file remains. Fable review found the original test empirically passed with the fix reverted (spy throws before real I/O regardless of implementation); strengthened it to record each spied call's path and assert the failing 2nd call targets a .lore-sync-tmp-* temp file, not the destination path -- mutation-checked to fail against the reverted implementation. Verified: bun run typecheck clean; bun test 1719 pass / 0 fail / 4847 expect() calls across 45 files; bun run lint 0 errors. Existing dry-run and multi-file success tests (AC#3) pass unmodified.
<!-- SECTION:FINAL_SUMMARY:END -->
