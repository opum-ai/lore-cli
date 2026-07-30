---
id: LCLI-283.3
title: Add LadybugDB-enabled local graph capabilities
status: To Do
assignee: []
created_date: '2026-07-30 13:34'
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
- [ ] #1 Users explicitly create or select a workspace; Lore never silently combines every repository into one user-global graph
- [ ] #2 Workspace graph, query, context, path, impact, change, and provenance results are bounded, deterministic, and repository-scoped
- [ ] #3 Cross-repository identities, links, tasks, snapshots, and conflicts retain repository, bundle, commit, export digest, and source-path evidence
- [ ] #4 Capabilities have stable CLI contracts and conformance fixtures independent of LadybugDB-specific identifiers or raw Cypher
<!-- AC:END -->
