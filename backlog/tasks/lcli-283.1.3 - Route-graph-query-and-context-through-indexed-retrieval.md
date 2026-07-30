---
id: LCLI-283.1.3
title: Route graph query and context through indexed retrieval
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-07-30 23:00'
labels:
  - ladybugdb
  - retrieval
  - compatibility
milestone: m-13
dependencies:
  - LCLI-283.1.2
  - LCLI-284
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

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a native-safe Ladybug boundary that records the exact 0.18.2/storage-42 compatibility facts without importing the addon, dynamically loads and verifies the native driver only after platform support and control-manifest preflight select an indexed operation, and refactor lifecycle inspection/build/reuse to use that loader without changing the frozen state ordering or recovery rules.
2. Add a verified indexed read model that reads canonical ConceptRecord and AuthoredEdgeRecord payloads from an immutable generation, validates and reconstructs the deterministic BundleGraph shape using stored token estimates and source identities, excludes task edges from concept traversal, preserves duplicates/dangling/additive fields, and exposes no Cypher, native ids, database paths, or native errors.
3. Add a Lore-owned retrieval resolver that attempts lifecycle reconcile plus verified indexed read on supported hosts and otherwise loads the existing in-memory graph; make fallback decisions before output, discard failed indexed warnings/results, retain the reference loader as an injectable conformance oracle, and preserve source-file read-only behavior.
4. Route graph, query, and context through that resolver by extending the existing Commander RunContext/handler injection boundary; keep manifest parsing, validation, renderers, envelopes, stream ownership, exit codes, output precedence, TTY/NO_COLOR, lexical BM25/filtering, traversal, budgets, truncation, and error semantics unchanged.
5. Add shared indexed-versus-reference command/core fixtures and focused lifecycle tests covering JSON/plain/pretty parity, errors, ordering/ties/filters/depth/budgets/provenance, Unicode, duplicate/dangling/additive/empty/boundary cases, missing/stale/incompatible/corrupt/locked/contended/unsupported states, no partial output, source no-write, absence of public database details, and objective native lazy-loading/Windows-safe fallback.
6. Update architecture, CLI, roadmap, and campaign handover prose through Lore, then verify only with Bun 1.2.23: focused and full tests, lint, typecheck, source/compiled startup and versions, supported compiled/native smokes, frozen install, package dry-run, audit, Lore sync/strict validation/check, and git diff hygiene. Follow Backlog finalization, map executed evidence to all four criteria, and complete only LCLI-283.1.3 without changing its parent or siblings.
<!-- SECTION:PLAN:END -->
