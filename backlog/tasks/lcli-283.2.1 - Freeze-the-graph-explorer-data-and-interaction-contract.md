---
id: LCLI-283.2.1
title: Freeze the graph explorer data and interaction contract
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
labels:
  - graph-explorer
  - design
  - contract
milestone: m-14
dependencies: []
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.2
priority: high
type: task
ordinal: 392000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the read-only explorer payload, deterministic snapshot format, supported node and edge properties, filters, detail views, provenance, graph-health indicators, navigation, and bounded rendering behavior before UI implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The contract covers concepts, tasks, repositories, authored edge types, duplicate and dangling edges, supersession, summaries, status, bundle, commit, and source path
- [ ] #2 The contract supports deterministic static export and optional loopback refresh without exposing database credentials or raw Cypher
- [ ] #3 Keyboard, screen-reader, color, responsive, empty, corrupt, stale, and large-graph states have testable interaction requirements
- [ ] #4 The design clearly separates source facts from layout coordinates and other disposable presentation state
<!-- AC:END -->
