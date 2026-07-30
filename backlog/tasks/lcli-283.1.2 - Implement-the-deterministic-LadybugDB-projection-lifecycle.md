---
id: LCLI-283.1.2
title: Implement the deterministic LadybugDB projection lifecycle
status: To Do
assignee: []
created_date: '2026-07-30 13:33'
labels:
  - ladybugdb
  - indexing
  - cache
milestone: m-13
dependencies:
  - LCLI-283.1.1
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.1
priority: high
type: task
ordinal: 388000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Build and maintain the versioned LadybugDB projection from Lore export records with deterministic identities, transactional replacement, freshness checks, and safe recovery from partial or corrupt state.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Identical export records produce an equivalent projection and stable observable metadata on every rebuild
- [ ] #2 Changed, deleted, duplicate, dangling, and unknown records reconcile without stale nodes or edges
- [ ] #3 Build interruption or corruption leaves either the prior valid projection or a clearly rebuildable state
- [ ] #4 Index files are treated as disposable local state and never committed or mistaken for Git or OKF source truth
<!-- AC:END -->
