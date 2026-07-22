---
id: LORE-179
title: >-
  lore unlink/rename retry after failed backlog commit silently no-ops on the
  leftover dirty file
status: To Do
assignee: []
created_date: '2026-07-22 16:50'
labels:
  - cmd-link
dependencies: []
priority: medium
ordinal: 189000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Sibling of LORE-121 (wave-5 Fable review finding). LORE-121 fixed runLink's already-present/unchanged branch to include the task's file path as a git-status commit candidate, so a retry after a prior failed backlog/ commit recommits the leftover dirty task file instead of a false no-op success. The SAME same-class gap remains in two sibling paths in src/commands/link.ts: runUnlink's removeBackRefs 'already-absent' branch (link.ts ~374-376) pushes nothing, and moveBackRefs's 'already-current' branch (link.ts ~441-449) pushes nothing. So a retry of `lore unlink` / `lore rename` after a failed backlog commit will still silently no-op on the leftover dirty file, leaving backlog/ dirty until an unrelated sweep catches it. Apply LORE-121's fix pattern (push detail.file in the no-edit branch, truthy-guarded) symmetrically to these two paths.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 runUnlink: a retry after a failed backlog/ commit, where the back-reference was already absent (no edit needed), detects the leftover dirty task file and commits it (or surfaces an explicit non-zero/drift failure) rather than a false no-op success
- [ ] #2 moveBackRefs (lore rename): a retry where the back-reference was already current detects and commits the leftover dirty task file rather than a false no-op success
- [ ] #3 A genuinely-clean unlink/rename run (nothing dirty) still yields a true no-op (empty commit, exit 0), preserving current behavior
- [ ] #4 Regression tests in test/link.test.ts cover the unlink retry and the rename retry, each proven to fail against the pre-fix code
<!-- AC:END -->
