---
id: LCLI-283.1.1
title: Freeze the LadybugDB projection schema and lifecycle
status: In Progress
assignee:
  - '@codex'
created_date: '2026-07-30 13:32'
updated_date: '2026-07-30 18:48'
labels:
  - ladybugdb
  - architecture
  - indexing
milestone: m-13
dependencies: []
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 387000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the local property-graph schema, stable identities, provenance, index format version, freshness fingerprint, migration and rebuild rules, storage location, and single-writer concurrency contract before runtime integration begins.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Schema maps every export record and authored edge without losing duplicate, dangling, unknown-field, task, repository, commit, bundle, or source provenance
- [ ] #2 Freshness and compatibility checks deterministically distinguish reusable, rebuildable, corrupt, locked, and unsupported index states
- [ ] #3 The lifecycle defines atomic build or replacement, cleanup, recovery, and no-write behavior for repository source files
- [ ] #4 The accepted LadybugDB ADR and local graph roadmap document the final contract and retained no-vector boundary
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze a lossless LadybugDB property-graph projection over export schema 1.0, including stable source identities, raw canonical records, duplicate and dangling authored-edge records, task data, and repository/bundle/commit/export/source provenance without exposing database-native identifiers.
2. Specify repository-local storage, index/control format and deterministic freshness fingerprints, with exact compatibility classification for reusable, rebuildable, corrupt, locked, and unsupported states.
3. Specify the rebuild-only M6 migration policy and single-writer lifecycle: isolated staging, close/reopen verification, atomic generation publication, interrupted-build cleanup, conservative lock recovery, read-only reuse, and source-file no-write guarantees.
4. Expand ADR-0018 and the local graph roadmap with the frozen contract and retained no-vector/no-Cypher boundary; create the Lore-managed release-campaign handover runbook with the live cursor and verification evidence.
5. Add focused contract tests or executable documentation assertions where they prevent schema/lifecycle drift without installing or wiring LadybugDB; run pinned-Bun focused/full documentation-appropriate gates, Lore sync/strict validation/check, and diff hygiene before finalization.
<!-- SECTION:PLAN:END -->
