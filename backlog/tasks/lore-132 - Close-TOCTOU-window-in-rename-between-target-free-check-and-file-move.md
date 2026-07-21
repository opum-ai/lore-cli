---
id: LORE-132
title: Close TOCTOU window in rename between target-free check and file move
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A file created at the rename destination path after `assertTargetFree`'s precheck but before `moveFile`'s `renameSync` runs is never silently overwritten by `lore rename`; the command instead fails loudly with the same `conflict` error `assertTargetFree` raises for a pre-existing destination.
- [ ] #2 test/rename.test.ts gains a regression test that simulates the race window (e.g. creating the destination file after the plan/precheck phase but before `commitWrites` executes the move) and asserts the rename aborts without writing over the concurrently created file.
- [ ] #3 Existing case-only rename behavior (destination resolving to the same inode as the source) continues to succeed unaffected by the added check.
<!-- AC:END -->
