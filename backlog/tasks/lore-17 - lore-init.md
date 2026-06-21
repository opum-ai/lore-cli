---
id: LORE-17
title: lore init
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-2
dependencies:
  - LORE-15
  - LORE-16
documentation:
  - docs/reference/cli-surface.md
priority: high
ordinal: 17000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create the docs/ bundle, .lore/ state, and the root index.md (okf_version on root only).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 init produces a conformant empty OKF bundle
- [ ] #2 Re-running init is idempotent
<!-- AC:END -->
