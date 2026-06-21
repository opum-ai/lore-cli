---
id: LORE-31
title: lore graph
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-4
dependencies:
  - LORE-16
documentation:
  - docs/reference/cli-surface.md
priority: medium
ordinal: 31000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Emit the cross-link graph as dot or json; cycle-tolerant; include per-doc/bundle token estimates (chars/4).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 graph --format dot and json both work
- [ ] #2 Token estimates surface in --json
<!-- AC:END -->
