---
id: LORE-54
title: Rewrite src/adapters/backlog.ts against upstream's real --json contract
status: To Do
assignee: []
created_date: '2026-07-18 00:02'
labels:
  - core
  - adapter
milestone: m-0
dependencies:
  - LORE-53
documentation:
  - docs/reference/backlog-json-schema.md
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 57000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
src/adapters/backlog.ts (LORE-4/LORE-21) was built against the jeremy-newhouse/Backlog.md fork's own {schemaVersion, kind, data} envelope design. lore is adopting upstream's independently-shipped --json contract instead (PR #790, BACK-545 -- see docs/reference/backlog-json-schema.md §8 for the full comparison). As written today the adapter would fail its own capability probe against upstream's real output: different envelope shape (per-command tasks/task/results keys, not a shared data key), a numeric schemaVersion instead of a string, hyphenated kind spellings (task-list/task-view/search), different task/search-hit fields, and a not-found exit code that flips from 0 to 1. Depends on LORE-53 (the pinned-commit dependency) so there's a real upstream build to test against.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 src/adapters/backlog.ts's envelope parsing, Zod schemas (EnvelopeSchema, TaskSchema, TaskSummarySchema, SearchHitSchema), and probeBacklog match upstream's real contract: per-command envelope keys (`tasks`/`task`/`results`, not `data`), numeric `schemaVersion`, and `kind: "task-list"`/`"task-view"`/`"search"` spelling
- [ ] #2 viewTask's missing-task detection uses upstream's nonzero exit code (`task view <missing>` exits 1) instead of the fork's empty-stdout signal
- [ ] #3 The golden test suite (test/backlog-json-golden.test.ts and its fixtures) is recaptured against the pinned upstream build and passes
- [ ] #4 docs/reference/backlog-json-schema.md §1-7 is rewritten to describe upstream's contract as the current, shipped shape (no longer marked pending-migration)
<!-- AC:END -->
