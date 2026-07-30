---
id: LCLI-283.3.1
title: Define explicit local workspaces and cross-repository identity
status: To Do
assignee: []
created_date: '2026-07-30 13:34'
labels:
  - workspace
  - identity
  - provenance
  - ladybugdb
milestone: m-15
dependencies: []
documentation:
  - docs/specs/local-graph-platform-roadmap.md
parent_task_id: LCLI-283.3
priority: medium
type: task
ordinal: 396000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Specify an explicit local workspace manifest and namespaced identity model for composing selected repository exports without introducing a hidden user-global graph or weakening deterministic provenance.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Workspace membership is explicit, inspectable, portable where appropriate, and never inferred from all repositories on the machine
- [ ] #2 Concept, task, edge, bundle, repository, commit, export digest, and source identities remain unambiguous across duplicate names and overlapping worktrees
- [ ] #3 Add, remove, branch-change, missing-repository, renamed-repository, conflicting-link, and stale-snapshot behavior is deterministic
- [ ] #4 Workspace databases remain disposable projections with documented rebuild, deletion, and privacy boundaries
<!-- AC:END -->
