---
id: LCLI-231
title: >-
  writeFileAtomic leaks an uncleaned temp file when writeFileSync fails
  mid-write
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
labels:
  - cmd-crud-b
  - codex-review-followup
  - fswrite
dependencies: []
priority: low
type: bug
ordinal: 333000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `src/commands/fswrite.ts`, `writeFileAtomic` sets its `tmpFileExists` cleanup guard to `true` only AFTER `writeFileSync(tmpPath, contents)` fully returns (live: src/commands/fswrite.ts:225-226). When that write CREATES the temp file and then fails partway through (e.g. ENOSPC/EDQUOT/EIO — the disk fills after the directory entry is allocated), the temp file exists on disk but `tmpFileExists` is still `false`, so the catch block's cleanup `unlinkSync(tmpPath)` (src/commands/fswrite.ts:244-252) is skipped and a stray `.lore-sync-tmp-*` file is left behind, unreported.

Why it matters: `writeFileAtomic` is the write discipline `lore sync` and `lore replace` use; on a disk-full/I-O-fault condition it should not also litter the bundle with an orphaned temp file. The sibling `writeFileNoFollow` already avoids this by opening its temp with `O_EXCL` and marking `tmpFileExists` immediately after the open (src/commands/fswrite.ts:681-685), so a mid-write failure there still cleans up.

Provenance: Codex second-opinion review (backlog doc-2, low-severity section), cluster cmd-crud-b. Confirmed still live on `dev`. The existing LCLI-116 commit-phase test does not cover this path because its spied `writeFileSync` throws before the real write ever creates the temp file (test/replace.test.ts:561-569).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A `writeFileAtomic` call whose temp `writeFileSync` creates the file and then throws leaves no `.lore-sync-tmp-*` file behind in the destination directory.
- [x] #2 The pre-existing 'a write failure BEFORE any temp file exists never claims one may remain' behavior is preserved: when no temp file was ever created (e.g. EACCES on a read-only directory), the surfaced error's hint must still not mention a stray temp file (regression guard: test/replace.test.ts around the 'never claims one may remain' test).
- [x] #3 A new test injects a mid-write failure that leaves the temp file on disk (e.g. a spied `writeFileSync` that creates the file then throws) and asserts the destination directory is free of `.lore-sync-tmp-*` litter afterward.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Restructure writeFileAtomic's temp-file creation to open the temp file via openSync(O_CREAT|O_EXCL) and set tmpFileExists=true immediately after the open succeeds, mirroring writeFileNoFollow's discipline. 2. Write the content bytes via writeAllBytes's writeSync loop instead of a single writeFileSync call, so a mid-write failure (after the temp file provably exists) still hits the catch block's unlinkSync cleanup. 3. Keep the existing 'no temp ever created' (EACCES on open) hint-suppression behavior intact (AC#2). 4. Update test/replace.test.ts's LCLI-116 commit-phase spy (previously on writeFileSync) to spy on openSync+writeSync instead, since writeFileAtomic no longer calls writeFileSync. 5. Add a new regression test (AC#3) that spies on writeSync to fail after the real openSync creates the temp file, asserting no .lore-sync-tmp-* litter remains.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Restructured writeFileAtomic (src/commands/fswrite.ts) to create its temp file via openSync(O_WRONLY|O_CREAT|O_EXCL, 0o666) and set tmpFileExists=true the instant that open returns, then write bytes through writeAllBytes's writeSync loop (mirrors writeFileNoFollow's existing discipline exactly) -- a mid-write failure now hits the catch block's unlinkSync cleanup instead of leaving a stray .lore-sync-tmp-* file. Updated test/replace.test.ts's LCLI-116 commit-phase atomicity test to spy on openSync+writeSync (writeFileAtomic no longer calls writeFileSync at all) instead of writeFileSync, preserving its discriminating assertions. Added a new test 'LCLI-231: a mid-write failure AFTER the temp file was created leaves no .lore-sync-tmp-* litter' (spies writeSync to throw after the real openSync creates the file) directly proving AC#1/AC#3. Verified AC#2 is untouched: the pre-existing 'never claims one may remain' regression test (EACCES on a read-only dir, so openSync itself fails and no temp is ever created) still passes unmodified -- its hint still omits 'temp file'.

Verification: full 'bun test' = 1973 pass / 0 fail across 47 files; 'bun run typecheck' clean (tsc --noEmit, no errors); targeted run of test/replace.test.ts + test/fswrite.test.ts = 110 pass / 0 fail; 'bunx biome check src/commands/fswrite.ts test/replace.test.ts' reports no issues. Diff is scoped to src/commands/fswrite.ts + test/replace.test.ts + this task file only.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed writeFileAtomic's tmpFileExists cleanup-guard timing gap (src/commands/fswrite.ts): it now creates its temp file via an O_CREAT|O_EXCL openSync and marks the guard true the instant that open returns, then writes bytes via writeAllBytes's writeSync loop -- mirroring writeFileNoFollow's existing discipline -- so a mid-write failure (ENOSPC/EDQUOT/EIO after the temp file was already created) is cleaned up by the catch block's unlinkSync instead of leaking a stray .lore-sync-tmp-* file. The pre-existing no-temp-ever-created (EACCES on openSync) path is unchanged: its error still never claims a temp file may remain. Updated test/replace.test.ts's LCLI-116 commit-phase spy from writeFileSync to openSync+writeSync (writeFileAtomic no longer calls writeFileSync) and added a new regression test that spies writeSync to fail after a real temp-file creation, asserting no litter survives. Verified: bun test 1973 pass/0 fail, bun run typecheck clean, biome check clean on both changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
