---
id: LORE-34
title: lore context (token-budgeted graph expansion)
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-4
dependencies:
  - LORE-16
  - LORE-28
documentation:
  - docs/adr/0015-lightweight-retrieval-no-vectors.md
priority: medium
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Assemble a concept body plus 1-line neighbor summaries via the graph, depth-bounded with --max-tokens. Deterministic; no ranking heuristics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Output respects --max-tokens
- [ ] #2 Deterministic for the same inputs
<!-- AC:END -->
