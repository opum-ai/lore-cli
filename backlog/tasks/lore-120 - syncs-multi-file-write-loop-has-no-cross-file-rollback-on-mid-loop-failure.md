---
id: LORE-120
title: sync's multi-file write loop has no cross-file rollback on mid-loop failure
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 134000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The write loop in runSync (src/commands/sync.ts:181-185) iterates `writes` and calls `writeFileAtomic` per file with no rollback/undo stack spanning the whole loop. Each individual file write is atomic, but if the process crashes or a later write fails partway through a multi-file sync, the files already written earlier in the loop remain updated on disk while later ones are not, leaving the docs bundle in a mixed old/new state with no automatic recovery. Unlike rename.ts/fswrite.ts, which document this as a known deferred limitation for their own multi-file operations, sync.ts carries no such disclaimer despite having the same exposure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The behavior and scope of sync's partial-write exposure (which files can be left in a mixed state, and that no automatic rollback occurs) is either fixed with an all-or-nothing write transaction across `writes`, or explicitly documented in sync.ts adjacent to the write loop so the limitation is discoverable rather than silent.
- [ ] #2 If a rollback/transaction mechanism is added, a regression test forces a failure partway through a multi-file `writes` loop (e.g. second of three files fails to write) and asserts none of the files were left modified on disk (or that the report accurately reflects the partial state, if full rollback is not implemented).
<!-- AC:END -->
