---
id: LORE-35.3
title: lore supersede (frontmatter wiring + inbound rewrite)
status: To Do
assignee: []
created_date: '2026-06-28 05:18'
labels:
  - cmd
milestone: m-4
dependencies: []
documentation:
  - docs/reference/cli-surface.md
parent_task_id: LORE-35
ordinal: 51000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mark old concept superseded by new and wire both ways (status: superseded, superseded_by/supersedes), preserving the old file; optionally repoint inbound links via the shared rewriteInbound engine (--rewrite-links). Reuses core/rewrite.ts from the rename subtask.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 supersession frontmatter is wired both ways and round-trips byte-stably
- [ ] #2 --rewrite-links repoints inbound links to the successor
<!-- AC:END -->
