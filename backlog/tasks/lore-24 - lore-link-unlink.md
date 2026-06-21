---
id: LORE-24
title: lore link / unlink
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-3
dependencies:
  - LORE-21
documentation:
  - docs/adr/0009-story-task-coupling-reconciliation.md
priority: high
ordinal: 24000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add tasks to a Story frontmatter and tag the task with a queryable label doc:<conceptId> (plus --doc for display).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 orphans can find tasks owning a doc via the label
- [ ] #2 unlink removes both sides cleanly
<!-- AC:END -->
