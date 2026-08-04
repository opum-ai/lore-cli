---
id: LCLI-283.1.1
title: Freeze the LadybugDB projection schema and lifecycle
status: Done
assignee:
  - '@codex'
created_date: '2026-07-30 13:32'
updated_date: '2026-08-03 16:10'
labels:
  - ladybugdb
  - architecture
  - indexing
  - 'doc:stories/build-the-persistent-local-graph-platform'
milestone: m-13
dependencies: []
references:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
documentation:
  - docs/specs/local-graph-platform-roadmap.md
  - docs/stories/build-the-persistent-local-graph-platform.md
modified_files:
  - docs/adr/0018-persistent-local-graph-projection-with-ladybugdb.md
  - docs/specs/local-graph-platform-roadmap.md
  - docs/runbooks/lore-cli-release-campaign-handover.md
  - docs/runbooks/index.md
  - docs/log.md
  - test/local-graph-contract.test.ts
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
- [x] #1 Schema maps every export record and authored edge without losing duplicate, dangling, unknown-field, task, repository, commit, bundle, or source provenance
- [x] #2 Freshness and compatibility checks deterministically distinguish reusable, rebuildable, corrupt, locked, and unsupported index states
- [x] #3 The lifecycle defines atomic build or replacement, cleanup, recovery, and no-write behavior for repository source files
- [x] #4 The accepted LadybugDB ADR and local graph roadmap document the final contract and retained no-vector boundary
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Freeze a lossless LadybugDB property-graph projection over export schema 1.0, including stable source identities, raw canonical records, duplicate and dangling authored-edge records, task data, and repository/bundle/commit/export/source provenance without exposing database-native identifiers.
2. Specify repository-local storage, index/control format and deterministic freshness fingerprints, with exact compatibility classification for reusable, rebuildable, corrupt, locked, and unsupported states.
3. Specify the rebuild-only M6 migration policy and single-writer lifecycle: isolated staging, close/reopen verification, atomic generation publication, interrupted-build cleanup, conservative lock recovery, read-only reuse, and source-file no-write guarantees.
4. Expand ADR-0018 and the local graph roadmap with the frozen contract and retained no-vector/no-Cypher boundary; create the Lore-managed release-campaign handover runbook with the live cursor and verification evidence.
5. Add focused contract tests or executable documentation assertions where they prevent schema/lifecycle drift without installing or wiring LadybugDB; run pinned-Bun focused/full documentation-appropriate gates, Lore sync/strict validation/check, and diff hygiene before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Frozen index format ladybug-projection/1 over validated export schema 1.0. The schema uses RepositoryProjection, ProjectionSnapshot, SourceCommit, ConceptRecord, TaskRecord, and one AuthoredEdgeRecord per exported edge; canonical sourceRecordJson and explicit repository/bundle/commit/export/task/path/target provenance retain additive fields, duplicates, and dangling records without Ladybug internal ids.

Lifecycle is repository-local and content-addressed, with immutable read-only generations, one exclusive writer, isolated staging, close/reopen structural verification, control-manifest-last publication, atomic directory rename, conservative lock recovery, quarantine only under exclusive ownership, and rebuild-only migration. Ordered classification covers locked, unsupported, corrupt, rebuildable, and reusable; no path writes repository sources.

Official research verified @ladybugdb/core as the native Node package and Ladybug concurrency as one read-write database object or multiple read-only objects. Exact package/version compatibility and native packaging remain for LCLI-283.1.2/.1.4; no package was installed or wired here.

Verification with /Users/jdnewhouse/.bun/bin/bun 1.2.23: focused contract test 4 passed/36 assertions; full suite 2,249 passed/6,489 assertions across 52 files; biome lint clean across 119 files; tsc --noEmit clean; host build compiled 222 modules and dist/lore --version returned 0.0.0; lore sync completed; lore validate --strict and lore check --strict each passed 46 concepts with 0 errors/warnings; git diff --check clean.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Frozen and regression-tested the LadybugDB M6 projection schema and lifecycle contract. ADR-0018 now specifies lossless export-record mapping, stable identities/provenance, repository-local format/storage, deterministic freshness/state classification, rebuild-only compatibility, and atomic single-writer publication/recovery. The roadmap records the binding summary and no-vector/no-Cypher/cloud boundary, and the Lore-managed release-campaign handover preserves the durable cursor. Verified by 4 focused contract tests, the 2,249-test full suite, lint, typecheck, host build/version, strict Lore validation/check, and diff hygiene under pinned Bun 1.2.23.
<!-- SECTION:FINAL_SUMMARY:END -->
