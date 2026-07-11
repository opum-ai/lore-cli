---
id: LORE-39
title: lore scaffold mkdocs
status: In Progress
assignee:
  - '@claude'
created_date: '2026-06-21 06:27'
updated_date: '2026-07-11 13:34'
labels:
  - cmd
  - consumers
milestone: m-6
dependencies:
  - LORE-28
documentation:
  - docs/reference/consumer-compatibility.md
priority: medium
ordinal: 39000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold repo-root mkdocs.yml (Material, navigation.indexes, tags + docs/tags.md, absolute_links relative_to_docs, validation warn). User-owned; never re-overwritten.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 mkdocs build succeeds on the bundle
- [ ] #2 Config is additive and OKF-harmless
<!-- AC:END -->
