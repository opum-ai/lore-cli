---
id: LORE-10
title: Implement .lore config loader (native TOML + env overlay)
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
labels:
  - core
milestone: m-1
dependencies: []
documentation:
  - docs/adr/0013-lore-state-directory.md
priority: high
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parse .lore/config.toml with Bun native TOML; overlay env (LORE_CONFLUENCE_TOKEN never persisted).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 config.toml is committed; cache/ is gitignored
- [ ] #2 Reconcile rules and link options are configurable
<!-- AC:END -->
