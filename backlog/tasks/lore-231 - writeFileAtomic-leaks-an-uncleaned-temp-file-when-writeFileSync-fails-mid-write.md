---
id: LORE-231
title: >-
  writeFileAtomic leaks an uncleaned temp file when writeFileSync fails
  mid-write
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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

Provenance: Codex second-opinion review (backlog doc-2, low-severity section), cluster cmd-crud-b. Confirmed still live on `dev`. The existing LORE-116 commit-phase test does not cover this path because its spied `writeFileSync` throws before the real write ever creates the temp file (test/replace.test.ts:561-569).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `writeFileAtomic` call whose temp `writeFileSync` creates the file and then throws leaves no `.lore-sync-tmp-*` file behind in the destination directory.
- [ ] #2 The pre-existing 'a write failure BEFORE any temp file exists never claims one may remain' behavior is preserved: when no temp file was ever created (e.g. EACCES on a read-only directory), the surfaced error's hint must still not mention a stray temp file (regression guard: test/replace.test.ts around the 'never claims one may remain' test).
- [ ] #3 A new test injects a mid-write failure that leaves the temp file on disk (e.g. a spied `writeFileSync` that creates the file then throws) and asserts the destination directory is free of `.lore-sync-tmp-*` litter afterward.
<!-- AC:END -->
