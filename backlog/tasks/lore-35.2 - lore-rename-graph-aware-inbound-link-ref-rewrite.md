---
id: LORE-35.2
title: lore rename (graph-aware inbound link/ref rewrite)
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
ordinal: 50000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Graph-aware concept rename: move a concept to a new id/path and rewrite every inbound cross-link + frontmatter ref via a surgical mdast-position string splice (no markdown serializer dep; no prose reflow), then regenerate sub-indexes. Introduces the shared core/rewrite.ts inbound-rewrite engine (rewriteInbound). Delivers LORE-35 AC#2.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rename updates every inbound link and reference
- [ ] #2 moved file's own outbound links are recomputed against its new location
- [ ] #3 authored prose outside changed link destinations is byte-unchanged
<!-- AC:END -->
