---
id: LORE-119
title: >-
  sync overwrites a status-changed doc using stale in-memory frontmatter,
  discarding concurrent on-disk edits
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
ordinal: 133000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runSync (src/commands/sync.ts:152-165), when a linked task's status changed during the reconciliation pass, the new file body is built via `serializeConcept({ ...concept, frontmatter: {...} }, { profile })` using the `concept` object captured in `targets`/`eligible` before the async Backlog round-trip (gatherReconciliation -> resolveAllTasks, see reconcile-shared.ts:158-177), not from the `original` bytes that are freshly re-read at line 155. Because `concept` is never re-read after that async gap, any edit made to the doc file on disk during the Backlog subprocess round-trip is silently discarded whenever `statusChanged` is also true — the freshly-read `original` is read but then thrown away in favor of the stale in-memory object for that branch.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When a target's status changes during sync, the frontmatter/body used to build the new file content is derived from the freshly re-read `original` bytes (not the pre-round-trip in-memory `concept` object), so any other concurrent change already present in `original` survives the status update.
- [ ] #2 A regression test simulates a concurrent on-disk edit to a linked doc occurring between the initial concept load and the status-changing write (e.g. by mutating the file on disk during/after gatherReconciliation but before the write loop) and asserts the edit is preserved in the final written bytes rather than being overwritten.
<!-- AC:END -->
