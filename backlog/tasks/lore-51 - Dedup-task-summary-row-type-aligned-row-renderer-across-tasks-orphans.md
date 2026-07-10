---
id: LORE-51
title: Dedup task-summary row type + aligned-row renderer across tasks/orphans
status: To Do
assignee: []
created_date: '2026-07-10 17:30'
labels:
  - cmd
  - cleanup
dependencies: []
priority: low
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Code review of LORE-32 (lore orphans) surfaced display-layer duplication with the already-shipped LORE-25 (lore tasks): (1) orphans.ts OrphanTask {id,title,status} is byte-identical to tasks.ts TaskRollupRow (same fields, same doc comments); (2) renderReport's orphan-task block re-implements tasks.ts renderTable's aligned id/status/title column table (both compute per-column widths and pad-align rows). A future column-layout change (extra column, truncation, width cap) must be made in two places and can silently diverge between the two commands' output.

Deferred from LORE-32 deliberately: extracting shared logic OUT of an already-shipped command is a cross-cutting change that warrants its own focused review (same call made for the readValue value-flag reader, now duplicated across context/graph/query/schema/tasks — consider folding that in or tracking adjacently). Keeping it out kept LORE-32 net-new and avoided re-testing tasks.ts inside a feature PR.

Scope: lift a shared task-summary-row type (e.g. TaskSummaryRow {id,title,status}) and a shared aligned-row renderer (a small output.ts helper) and call both from tasks.ts and orphans.ts. Note: tasks.ts renderTable also uses Math.max(...rows.map(...)) — orphans.ts already replaced that with a spread-free maxLen loop (a six-figure row list overflows the argument spread); the shared helper should carry the spread-free version so tasks.ts inherits the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A single task-summary-row type is shared by lore tasks and lore orphans (no byte-identical redeclaration)
- [ ] #2 A single aligned-row renderer is shared by both commands; changing the column layout is a one-place edit
- [ ] #3 The shared width computation is spread-free (no Math.max(...array)); tasks.ts inherits the hardening
- [ ] #4 lore tasks and lore orphans text output is byte-identical to before the refactor (golden/snapshot unchanged)
<!-- AC:END -->
