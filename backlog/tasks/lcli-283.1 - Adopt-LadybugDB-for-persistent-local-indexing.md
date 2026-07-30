---
id: LCLI-283.1
title: Adopt LadybugDB for persistent local indexing
status: To Do
assignee: []
created_date: '2026-07-30 13:32'
labels:
  - ladybugdb
  - indexing
  - performance
  - local-graph
milestone: m-13
dependencies:
  - LCLI-31
  - LCLI-33
  - LCLI-34
  - LCLI-279
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283
priority: high
type: feature
ordinal: 386000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce LadybugDB as the rebuildable persistent local projection behind Lore retrieval so repeated graph, query, and context operations scale beyond per-invocation parsing while preserving the current deterministic contracts and Git-native source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A fresh LadybugDB projection can be built from the deterministic export and is invalidated or rebuilt on schema, bundle, task, repository, or commit mismatch
- [ ] #2 Graph, query, and context preserve their documented envelopes, errors, ordering, filters, depth, budgets, and no-embedding behavior across indexed and fallback paths
- [ ] #3 Corrupt, stale, locked, or incompatible indexes fail safely or rebuild without changing repository source files
- [ ] #4 Supported install and binary targets pass native packaging, concurrency, migration, recovery, and deterministic conformance tests
- [ ] #5 Cold and warm benchmarks on representative small and large bundles demonstrate explicit performance, memory, disk, and scale gates
<!-- AC:END -->
