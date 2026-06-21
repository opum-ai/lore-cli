---
id: LORE-16
title: 'bundle.ts: walk docs/ and build the model + cross-link graph'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - core
milestone: m-2
dependencies:
  - LORE-15
documentation:
  - docs/reference/architecture.md
priority: high
ordinal: 16000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Walk the OKF bundle, build the in-memory concept model and cross-link graph reused by graph/query/context/links.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Bundle model lists all concepts with types and links
- [ ] #2 Graph is deterministic and cycle-tolerant
<!-- AC:END -->
