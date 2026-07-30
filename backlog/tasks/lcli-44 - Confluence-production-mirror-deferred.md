---
id: LCLI-44
title: Confluence production mirror (deferred)
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-07-30 13:29'
labels:
  - deferred
  - confluence
milestone: m-12
dependencies:
  - LCLI-43
documentation:
  - docs/adr/0016-confluence-one-way-publish-deferred.md
priority: low
ordinal: 44000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DEFERRED: cross-link rewriting (reuse links.ts), directory-tree hierarchy mapping (parents before children), --prune, labels/page-props from frontmatter, ADF edge cases, rate-limit/retry.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unresolved links render as plain text + warning
- [ ] #2 --prune detects orphaned pages
<!-- AC:END -->
