---
id: LCLI-132
title: Close TOCTOU window in rename between target-free check and file move
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
labels:
  - codex-review-followup
  - cmd-rename-supersede
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 146000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`assertTargetFree` (src/commands/rename.ts:249-263) checks the destination path with a plain `existsSync` at plan time (called once from `runRename`), but the actual relocation happens much later in `commitWrites` (lines 280-307) via `moveFile`'s `renameSync` (line 305), which atomically replaces whatever occupies the destination without ever re-checking. Between the precheck and the move, another process (or a concurrent lore invocation) can create a file at the destination path, and `renameSync` will silently clobber it instead of lore reporting the conflict it was designed to catch. This matters because `assertTargetFree`'s whole purpose is to prevent exactly this kind of silent overwrite, and the current implementation only protects against a collision that already existed before planning began, not one that appears during the (potentially I/O-heavy) window between plan and commit.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A file created at the rename destination path after `assertTargetFree`'s precheck but before `moveFile`'s `renameSync` runs is never silently overwritten by `lore rename`; the command instead fails loudly with the same `conflict` error `assertTargetFree` raises for a pre-existing destination.
- [x] #2 test/rename.test.ts gains a regression test that simulates the race window (e.g. creating the destination file after the plan/precheck phase but before `commitWrites` executes the move) and asserts the rename aborts without writing over the concurrently created file.
- [x] #3 Existing case-only rename behavior (destination resolving to the same inode as the source) continues to succeed unaffected by the added check.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a same-inode-aware no-clobber guard to fswrite.ts's moveFile, run immediately before renameSync: statSync both source and destination; if dest exists and its dev/ino differs from source, throw the same conflict LoreError assertTargetFree raises (dest identical inode = case-only rename, proceed unaffected).
2. Keep rename.ts's existing plan-time assertTargetFree precheck as-is (fast fail before any writes); the new guard in moveFile closes the remaining window right up to the renameSync syscall.
3. Add a regression test in test/rename.test.ts using the existing spyOn(fs, writeFileSync) pattern (see replace.test.ts LCLI-116 test) to inject a concurrently-created destination file exactly when commitWrites writes the source's new bytes, immediately before moveFile runs — assert the rename throws conflict and the concurrently-created file survives untouched.
4. Verify the existing case-only-rename test still passes unaffected, run full suite + typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added assertMoveTargetSafe (fswrite.ts moveFile), an immediately-before-renameSync statSync dev/ino identity check: a destination now stat'd fresh at commit time, right before the syscall — same inode as source (case-only rename) proceeds unaffected; a different file (raced in after the plan-time assertTargetFree precheck) throws the same 'conflict' LoreError type assertTargetFree raises. rename.ts's plan-time assertTargetFree kept as-is (fast-fail before any writes); docstrings updated to point at moveFile as the actual TOCTOU-closing guarantee. New regression test in test/rename.test.ts hooks fs.writeFileSync (spyOn, same pattern as replace.test.ts's LCLI-116 test) keyed on the source path to inject a concurrently-created destination file exactly between commitWrites' write-back-into-source step and moveFile's renameSync, deterministically simulating the race without real concurrency.

Verified: bun test test/rename.test.ts -> 98 pass/0 fail (includes the new race regression test and the pre-existing case-only-rename test, both passing). Full bun test -> 1739 pass/0 fail across 46 files. bun run typecheck (tsc --noEmit) -> clean, no errors. bun run lint (biome check .) -> no findings in the 3 changed files (src/commands/fswrite.ts, src/commands/rename.ts, test/rename.test.ts); the 4 pre-existing infos biome reports are all in unrelated files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the TOCTOU window between rename's plan-time assertTargetFree precheck and moveFile's renameSync: moveFile (fswrite.ts) now re-stats the destination immediately before the rename syscall and compares dev/ino against the source, throwing the same 'conflict' LoreError for a genuinely different file that appeared in the race window while still letting a same-inode (case-only) rename through unaffected. Verified via bun test test/rename.test.ts (98/98 pass, new race regression + existing case-only test both green), full bun test (1739/1739 pass), and a clean tsc --noEmit typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
