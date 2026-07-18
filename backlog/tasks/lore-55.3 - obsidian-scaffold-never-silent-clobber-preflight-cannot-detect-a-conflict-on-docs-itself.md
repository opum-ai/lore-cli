---
id: LORE-55.3
title: >-
  obsidian scaffold: never-silent-clobber preflight cannot detect a conflict on
  docs/ itself
status: To Do
assignee: []
created_date: '2026-07-18 22:54'
labels:
  - cmd
  - core
dependencies: []
references:
  - 'https://github.com/jeremy-newhouse/lore/pull/50'
modified_files:
  - src/commands/scaffold.ts
parent_task_id: LORE-55
priority: low
type: bug
ordinal: 61000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
runScaffold's never-silent-clobber preflight (src/commands/scaffold.ts, the blockedDirs check) calls existsSync only on the full plan.dirs path, so for obsidian's nested "docs/.obsidian" it cannot detect a conflict sitting on the ancestor "docs" segment, unlike mkdocs/docusaurus's single-segment dirs. If docs is a plain file (not a directory) when a user runs `lore scaffold obsidian` without --force, the polished "obsidian config already exists ... pass --force to overwrite" preflight message never fires (existsSync on docs/.obsidian is false -- a path cannot traverse a non-directory parent). The command instead falls through to writeAllOrRollback and surfaces a lower-level conflict error that never names docs as the actual blocker and never mentions --force, unlike every other scaffold conflict message.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The preflight check in runScaffold detects a non-directory occupying any ancestor segment of a planned nested directory (e.g. docs occupied by a plain file), not just the exact leaf path
- [ ] #2 A new test reproduces docs as a plain file and asserts the friendly "already exists ... --force" conflict message fires for obsidian, matching docusaurus's existing "pre-existing non-directory file occupying website/" regression test
<!-- AC:END -->
