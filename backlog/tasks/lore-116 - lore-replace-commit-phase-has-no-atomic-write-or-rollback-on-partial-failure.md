---
id: LORE-116
title: lore replace commit phase has no atomic write or rollback on partial failure
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A write failure partway through the Phase-2 commit loop in runReplace no longer leaves any single target file truncated or half-written (each file write is atomic, e.g. via writeFileAtomic's temp-file+rename discipline).
- [ ] #2 A regression test simulates a write failure on one of several planned files (e.g. by mocking/stubbing the write call to throw partway through) and asserts that files written before the failure are intact (not truncated) and the error surfaces rather than being silently swallowed.
- [ ] #3 Existing `lore replace` dry-run and successful multi-file replace behavior (report contents, exit code) is unchanged.
<!-- AC:END -->
