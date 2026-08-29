---
id: LCLI-358.5
title: >-
  Offer the Backlog-to-Quest migration only when Quest is selected and a real
  Backlog project exists
status: To Do
assignee: []
created_date: '2026-08-28 21:47'
labels:
  - init
  - tracker
  - migration
  - quest
dependencies: []
parent_task_id: LCLI-358
ordinal: 484000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The migration gate is wrong in four ways, all confirmed 2026-08-28.

1. **It hijacks the tracker question.** src/commands/init.ts's wizard replaces the tracker prompt with a migrate/pin choice whenever resolveTrackerSelection returns `legacy-backlog`, so jira and none are unreachable in a repository that happens to have a `backlog/` directory.
2. **A bare directory counts as a Backlog project.** src/tracker-selection.ts:78 checks only that `backlog/` is a real directory — no Backlog.md project marker.
3. **Legacy + quest without migration is a hard error.** You cannot select Quest and leave the Backlog tasks in place.
4. **An explicit backlog config is a dead end, and its escape hatch orphans data.** With `backend = "backlog"` already written, `lore init --tracker quest --migrate-backlog` is refused with `--migrate-backlog requires --tracker quest in a legacy zero-config Backlog bundle` — the flag it demands was passed. Meanwhile bare `--tracker quest` succeeds silently and orphans every Backlog task. The guard only covers zero-config bundles and its bypass is one flag away.

Offer migration only after the tracker question settles on Quest and a real Backlog project is present, with three explicit answers: migrate, keep Backlog in place, or pin Backlog as the tracker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The tracker question is always asked; a legacy Backlog bundle never removes jira or none from the choices
- [ ] #2 Migration is offered only when the selected tracker is quest and a real Backlog.md project (not a bare directory) exists
- [ ] #3 Selecting Quest over an explicitly configured Backlog bundle is reachable, and requires an explicit answer about the existing tasks rather than silently orphaning them
- [ ] #4 The --migrate-backlog refusal message names the actual unmet condition
<!-- AC:END -->
