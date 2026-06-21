---
id: LORE-26
title: lore sync
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-3
dependencies:
  - LORE-22
  - LORE-23
  - LORE-24
documentation:
  - docs/adr/0012-backlog-coexistence-git-ownership.md
priority: high
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Recompute status, rewrite managed blocks, regen index/log; lore git-adds/commits backlog task files; single-writer; atomic per-file writes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Idempotent: a second sync makes no changes
- [ ] #2 lore is the sole committer of backlog/
<!-- AC:END -->
