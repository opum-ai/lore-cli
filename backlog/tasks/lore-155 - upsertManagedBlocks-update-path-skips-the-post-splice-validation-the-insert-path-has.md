---
id: LORE-155
title: >-
  upsertManagedBlock's update path skips the post-splice validation the insert
  path has
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/core/managed-block.ts, upsertManagedBlock's update branch (currently lines 368-372) splices the new body between the located markers and returns immediately, with no re-parse of the result. A few lines below, the insert branch (lines 374-386) re-locates the markers in its result and throws a labeledMarkerError if they no longer parse as a clean top-level pair. This asymmetry means the update path has no equivalent fail-loud guard: if splicing a body that itself contains marker-like text (or otherwise disrupts top-level parsing) breaks the block structure, the update path silently returns corrupted content instead of erroring like the insert path does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The update branch of upsertManagedBlock re-locates the labeled markers in its spliced result (mirroring the insert branch's post-condition check) and throws the same labeledMarkerError-shaped validation error when the result no longer parses as a single clean top-level marker pair.
- [ ] #2 A regression test in test/managed-block.test.ts exercises an update where the new body content disrupts top-level marker parsing and asserts upsertManagedBlock throws rather than returning corrupted content.
<!-- AC:END -->
