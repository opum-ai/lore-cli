---
id: LCLI-283.3.3
title: Add bounded path and impact operations
status: To Do
assignee: []
created_date: '2026-07-30 13:34'
labels:
  - ladybugdb
  - path
  - impact
  - traversal
milestone: m-15
dependencies:
  - LCLI-283.3.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.3
priority: medium
type: enhancement
ordinal: 398000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose bounded, explainable path and change-impact operations over authored workspace relationships without exposing raw Cypher or allowing unbounded traversal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Path queries accept typed endpoints, direction and edge allowlists, maximum depth, result limits, and repository scope
- [ ] #2 Impact queries distinguish direct and transitive authored dependencies and report completeness, truncation, and traversal limits
- [ ] #3 Results preserve the exact edge chain and source provenance needed to explain why each result was included
- [ ] #4 Cycles, duplicate edges, dangling targets, no-path cases, high fan-out, and cross-repository isolation have deterministic fixtures and cost bounds
<!-- AC:END -->
