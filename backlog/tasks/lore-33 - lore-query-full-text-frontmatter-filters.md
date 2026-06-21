---
id: LORE-33
title: lore query (full-text + frontmatter filters)
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
  - docs/adr/0015-lightweight-retrieval-no-vectors.md
priority: medium
ordinal: 33000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In-memory full-text (BM25-style) + frontmatter-field filters; --max-tokens budget + truncation hints; reuse summary for snippets. No vectors/RAG.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Filter by type/tag/status/any field
- [ ] #2 Bounded output with a narrow-it hint
<!-- AC:END -->
