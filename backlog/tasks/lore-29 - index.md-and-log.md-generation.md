---
id: LORE-29
title: index.md and log.md generation
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 20:16'
labels:
  - core
milestone: m-4
dependencies:
  - LORE-47
documentation:
  - docs/reference/okf-conformance.md
priority: medium
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Deterministic, sorted generation; okf_version on root index only; sub-index files carry no frontmatter; index bodies link children as a navigable hub.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Regeneration is byte-identical on no change
- [ ] #2 Sub-index files are frontmatter-free
<!-- AC:END -->
