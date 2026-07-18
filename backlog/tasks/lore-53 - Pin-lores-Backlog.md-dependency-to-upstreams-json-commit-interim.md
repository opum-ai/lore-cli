---
id: LORE-53
title: Pin lore's Backlog.md dependency to upstream's --json commit (interim)
status: To Do
assignee: []
created_date: '2026-07-18 00:02'
labels:
  - backlog-fork
  - upstream
  - build
milestone: m-0
dependencies: []
documentation:
  - docs/runbooks/backlog-json-patch.md
  - docs/reference/backlog-cli-contract.md
priority: medium
ordinal: 56000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lore adopts MrLesk/Backlog.md's own --json implementation (PR #790, BACK-545) instead of upstreaming the jeremy-newhouse/Backlog.md fork (LORE-5). Since no tagged release contains that commit yet, wire lore's build/dependency to consume upstream's main branch pinned at or past the PR #790 merge commit (22a091b570d44c4f302ca47e7fd36fa28ad8bcb0) as an interim measure, and update the capability probe to recognize upstream's real envelope shape instead of the fork's. Once MrLesk/Backlog.md tags a release containing that commit, this pin is replaced by a normal semver dependency + a version-floor bump (a small follow-up, not tracked separately here).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore build/install wiring depends on a --json-capable `backlog` binary sourced from MrLesk/Backlog.md pinned at or past commit 22a091b570d44c4f302ca47e7fd36fa28ad8bcb0, not the jeremy-newhouse/Backlog.md fork
- [ ] #2 The capability probe's dry-run check (`backlog task list --json`) asserts upstream's real envelope shape (numeric `schemaVersion: 1`, `kind: "task-list"`, a `tasks` array) and passes against a real build of the pinned commit
<!-- AC:END -->
