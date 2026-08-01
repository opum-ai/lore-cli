---
id: LCLI-283.2.1
title: Freeze the graph explorer data and interaction contract
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:33'
updated_date: '2026-08-01 18:22'
labels:
  - graph-explorer
  - design
  - contract
milestone: m-14
dependencies:
  - LCLI-283.1.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/specs/graph-explorer-data-and-interaction-contract.md
modified_files:
  - src/core/explorer-contract.ts
  - test/explorer-contract.test.ts
  - test/fixtures/explorer/v1.json
  - docs/specs/graph-explorer-data-and-interaction-contract.md
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
- [x] #1 The contract covers concepts, tasks, repositories, authored edge types, duplicate and dangling edges, supersession, summaries, status, bundle, commit, and source path
- [x] #2 The contract supports deterministic static export and optional loopback refresh without exposing database credentials or raw Cypher
- [x] #3 Keyboard, screen-reader, color, responsive, empty, corrupt, stale, and large-graph states have testable interaction requirements
- [x] #4 The design clearly separates source facts from layout coordinates and other disposable presentation state
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit the frozen export/projection schema and existing deterministic envelope conventions, then map every required explorer fact and provenance field back to authored source data.
2. Define a versioned, Lore-owned explorer snapshot contract with deterministic ordering, explicit repository/concept/task/edge/health records, bounded-render metadata, and disposable presentation state kept outside source facts.
3. Add conformance fixtures and contract tests covering duplicate, dangling, supersession, empty, corrupt, stale, and large-graph cases plus static-export and loopback-refresh security boundaries.
4. Author the graph explorer data and interaction Spec through Lore, including keyboard, screen-reader, color, responsive, reduced-motion, detail/navigation, and failure-state requirements; update the roadmap without editing managed regions.
5. Run focused tests, full typecheck/lint as appropriate, Lore sync and strict validation/check, and diff hygiene; then verify each acceptance criterion through Backlog finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the strict lore-explorer-snapshot/1 and separate lore-explorer-presentation/1 schemas, deterministic serializer and cross-record invariants, bounded render limits, a duplicate/dangling/supersession fixture, and the Lore data/interaction specification with stable accessibility and health-state requirement IDs. Pinned Bun 1.2.23 focused verification passes 6 tests / 36 expectations; typecheck and repository lint pass.

Final objective verification under pinned Bun 1.2.23: focused explorer contract suite passes 6 tests / 47 expectations; the complete repository test suite exits 0; typecheck, repository lint, production build, and git diff --check pass. Strict Lore validation of both authored Specs reports 2 files, 0 errors, 0 warnings. AC 1-4 are verified by the executable payload/presentation schemas, conformance fixture/tests, exported refresh and interaction contracts, and the validated Spec. Remaining finalization gate: lore sync plus lore validate/check --strict; lore sync will auto-commit the dirty Backlog task record, so it awaits local commit authority for this task.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Froze lore-explorer-snapshot/1 as a strict, deterministic, database-neutral read contract with repository/concept/task/authored-edge provenance, graph-health invariants, duplicate/dangling/supersession preservation, and canonical serialization. Added a separate bounded lore-explorer-presentation/1 contract, machine-readable refresh and accessibility/state requirements, a representative conformance fixture, and the validated Lore interaction Spec/roadmap link. Verified under pinned Bun 1.2.23 with 6 focused tests / 47 expectations, the full repository suite, typecheck, lint, production build, strict Lore validation/check, and git diff --check.
<!-- SECTION:FINAL_SUMMARY:END -->
