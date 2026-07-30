---
id: LCLI-283.3.2
title: Index and retrieve across workspace repositories
status: To Do
assignee: []
created_date: '2026-07-30 13:34'
labels:
  - workspace
  - ladybugdb
  - search
  - context
milestone: m-15
dependencies:
  - LCLI-283.3.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.3
priority: medium
type: task
ordinal: 397000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Project all explicitly selected repository exports into one workspace-scoped LadybugDB graph and extend graph, query, and context with bounded repository selection and deterministic merged results.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workspace indexing incrementally adds, updates, and removes selected repository snapshots without retaining stale evidence
- [ ] #2 Graph, query, and context support all-workspace or explicit repository subsets with stable limits and ordering
- [ ] #3 Every result carries repository, bundle, commit, export digest, concept or task identity, and source path where applicable
- [ ] #4 Single-repository behavior remains compatible and workspace isolation tests prevent evidence from unselected workspaces or repositories
<!-- AC:END -->
