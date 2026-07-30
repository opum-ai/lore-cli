---
id: LCLI-283.1.3
title: Route graph query and context through indexed retrieval
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
labels:
  - ladybugdb
  - retrieval
  - compatibility
milestone: m-13
dependencies:
  - LCLI-283.1.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 389000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Use the fresh LadybugDB projection for local graph, lexical query, and context operations while keeping the documented CLI envelopes and deterministic semantics authoritative.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Indexed and reference in-memory implementations pass the same graph, query, context, error, ordering, truncation, and provenance conformance fixtures
- [ ] #2 Lexical ranking and filters remain deterministic and no embeddings, vector indexes, or model calls enter the default path
- [ ] #3 Missing, stale, incompatible, corrupt, or contended indexes follow the documented rebuild or fallback policy without partial output
- [ ] #4 No public command exposes raw Cypher or database-specific identifiers
<!-- AC:END -->
