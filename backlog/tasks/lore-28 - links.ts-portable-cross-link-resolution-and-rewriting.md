---
id: LORE-28
title: 'links.ts: portable cross-link resolution and rewriting'
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - core
milestone: m-4
dependencies:
  - LORE-16
documentation:
  - docs/adr/0010-multi-consumer-docs-layer.md
priority: high
ordinal: 28000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Compute per-file relative, URL-encoded, .md-suffixed links (no leading slash, no wikilinks); resolve and rewrite; shared by new/sync/link/index-gen/managed-block.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Generated links resolve across GitHub/Obsidian/MkDocs/Docusaurus
- [ ] #2 normalizeLink and validateLink are reused by other commands
<!-- AC:END -->
