---
id: LORE-137
title: >-
  reconcileDriftFindings ignores its own newStatus:null contract for
  managed-block drift
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ReconcileDriftInput.newStatus's docstring (src/core/check.ts:412-413) states null means the concept has no linked tasks and should 'never drift either way.' But reconcileDriftFindings (check.ts:446-479) only gates the status-drift check on `newStatus !== null` (line 449); the managed-block regeneration and drift comparison at line 468 (`regenerateTaskBlock(...)`) runs unconditionally regardless of newStatus. So a concept with no linked tasks (newStatus === null) can still produce a managed-block-drift finding, contradicting the documented 'never drift either way' contract for that input.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 reconcileDriftFindings returns no findings (neither status-drift nor managed-block-drift) when called with input.newStatus === null, matching the documented contract.
- [ ] #2 A regression test in test/check.test.ts calls reconcileDriftFindings with newStatus: null and rows/original data that would otherwise trigger a managed-block-drift finding, and asserts the returned findings array is empty.
<!-- AC:END -->
