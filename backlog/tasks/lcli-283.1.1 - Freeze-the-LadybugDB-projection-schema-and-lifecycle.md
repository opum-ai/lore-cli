---
id: LCLI-283.1.1
title: Freeze the LadybugDB projection schema and lifecycle
status: To Do
assignee: []
created_date: '2026-07-30 13:32'
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
