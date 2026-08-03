---
id: LCLI-283.3
title: Add LadybugDB-enabled local graph capabilities
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:34'
updated_date: '2026-08-03 13:53'
labels:
  - ladybugdb
  - local-graph
  - workspace
  - capabilities
milestone: m-15
dependencies:
  - LCLI-283.2
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283
priority: medium
type: feature
ordinal: 395000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
After the explorer ships, use the indexed graph to add explicit multi-repository workspaces and bounded path, impact, change, and provenance workflows that are impractical to deliver cleanly through per-invocation single-bundle traversal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users explicitly create or select a workspace; Lore never silently combines every repository into one user-global graph
- [x] #2 Workspace graph, query, context, path, impact, change, and provenance results are bounded, deterministic, and repository-scoped
- [x] #3 Cross-repository identities, links, tasks, snapshots, and conflicts retain repository, bundle, commit, export digest, and source-path evidence
- [x] #4 Capabilities have stable CLI contracts and conformance fixtures independent of LadybugDB-specific identifiers or raw Cypher
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Deliver explicit workspace identity and lifecycle through LCLI-283.3.1. 2. Deliver bounded workspace graph/query/context retrieval through LCLI-283.3.2. 3. Deliver bounded explainable path and impact traversal through LCLI-283.3.3. 4. Deliver explicit retained snapshot, changed, provenance, and explorer history workflows through LCLI-283.3.4. 5. Verify cumulative contracts, provenance, bounds, fixtures, and CI on integrated dev, then settle the parent.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Parent settlement evidence: all four subtasks LCLI-283.3.1 through LCLI-283.3.4 are Done and integrated. The cumulative dev tree at cd4e816 provides explicit workspace membership; bounded deterministic graph/query/context/path/impact/change/provenance operations; repository, bundle, commit, export, record, and source-path provenance; and storage-neutral stable CLI/conformance contracts without raw Cypher. Latest cumulative verification passed 2,425 tests with 8,008 expectations, lint, typecheck, 261-module compiled build, 18/18 browser tests, strict Lore validation/check across 56 docs, and all eight PR #289 CI jobs in run 30819483866.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed the LadybugDB-enabled capability layer across four integrated subtasks: explicit local workspaces and collision-safe identity, workspace indexing/retrieval, bounded explainable path/impact traversal, and explicit retained snapshot/change/provenance workflows with offline explorer history. All parent criteria are covered by stable storage-neutral contracts and conformance fixtures; cumulative dev verification passed 2,425 tests, build/lint/typecheck, 18 browser tests, strict Lore gates, and PR #289's eight-job CI matrix.
<!-- SECTION:FINAL_SUMMARY:END -->
