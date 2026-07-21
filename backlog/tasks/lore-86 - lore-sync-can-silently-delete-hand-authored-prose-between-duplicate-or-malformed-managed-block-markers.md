---
id: LORE-86
title: >-
  lore sync can silently delete hand-authored prose between duplicate or
  malformed managed-block markers
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - error-handling
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
locateManagedBlock recovers from a malformed marker layout (two begin/end pairs, or an unmatched begin) by taking the first begin to the last end, silently collapsing and deleting any hand-written prose sitting in between instead of failing loudly. This is reachable via a merge conflict or hand edit leaving index.md with duplicate lore:index markers; the next lore sync permanently deletes the prose between them with no warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 locateManagedBlock detects a malformed marker layout (duplicate begin/end pairs, or an unmatched begin) and fails with a clear error instead of silently collapsing content
- [ ] #2 A test covers the duplicate-marker-pair scenario (with real prose between the pairs) and asserts the prose is preserved or the operation is refused with a clear error, not silently deleted
<!-- AC:END -->
