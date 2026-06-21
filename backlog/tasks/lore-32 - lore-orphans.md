---
id: LORE-32
title: lore orphans
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-4
dependencies:
  - LORE-16
  - LORE-21
documentation:
  - docs/reference/cli-surface.md
priority: medium
ordinal: 32000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Report tasks with no owning doc, docs whose tasks vanished, dangling refs (target gone), and duplicate concepts (same title/type). Detection only, never auto-merge.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Finds dangling refs and vanished-task stories
- [ ] #2 Output supports --json
<!-- AC:END -->
