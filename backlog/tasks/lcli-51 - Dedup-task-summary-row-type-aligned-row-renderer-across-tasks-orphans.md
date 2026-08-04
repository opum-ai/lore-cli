---
id: LCLI-51
title: Dedup task-summary row type + aligned-row renderer across tasks/orphans
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:09'
labels:
  - cmd
  - cleanup
  - 'doc:stories/build-the-lore-cli-foundation'
dependencies: []
documentation:
  - docs/stories/build-the-lore-cli-foundation.md
priority: low
ordinal: 54000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Code review of LCLI-32 (lore orphans) surfaced display-layer duplication with the already-shipped LCLI-25 (lore tasks): (1) orphans.ts OrphanTask {id,title,status} is byte-identical to tasks.ts TaskRollupRow (same fields, same doc comments); (2) renderReport's orphan-task block re-implements tasks.ts renderTable's aligned id/status/title column table (both compute per-column widths and pad-align rows). A future column-layout change (extra column, truncation, width cap) must be made in two places and can silently diverge between the two commands' output.

Deferred from LCLI-32 deliberately: extracting shared logic OUT of an already-shipped command is a cross-cutting change that warrants its own focused review (same call made for the readValue value-flag reader, now duplicated across context/graph/query/schema/tasks — consider folding that in or tracking adjacently). Keeping it out kept LCLI-32 net-new and avoided re-testing tasks.ts inside a feature PR.

Scope: lift a shared task-summary-row type (e.g. TaskSummaryRow {id,title,status}) and a shared aligned-row renderer (a small output.ts helper) and call both from tasks.ts and orphans.ts. Note: tasks.ts renderTable also uses Math.max(...rows.map(...)) — orphans.ts already replaced that with a spread-free maxLen loop (a six-figure row list overflows the argument spread); the shared helper should carry the spread-free version so tasks.ts inherits the fix.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A single task-summary-row type is shared by lore tasks and lore orphans (no byte-identical redeclaration)
- [x] #2 A single aligned-row renderer is shared by both commands; changing the column layout is a one-place edit
- [x] #3 The shared width computation is spread-free (no Math.max(...array)); tasks.ts inherits the hardening
- [x] #4 lore tasks and lore orphans text output is byte-identical to before the refactor (golden/snapshot unchanged)
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Shipped: output.ts gains TaskSummaryRow {id,title,status}, spread-free maxLen
(moved from orphans.ts, now also used for orphans' danglingLinks concept-column
width), and renderTaskSummaryRows (the shared "  <id>  <status>  <title>"
aligned-line renderer). tasks.ts's TaskRollupRow and orphans.ts's OrphanTask
are now `export type X = TaskSummaryRow` aliases (no external consumer
imported the old interfaces directly, so this is a non-breaking rename).
tasks.ts's renderTable and orphans.ts's renderReport orphan-task block both
call renderTaskSummaryRows instead of their own padEnd loops; tasks.ts's
Math.max(...array) width computation is gone, inheriting orphans.ts's
spread-free hardening (AC#3).

AC#4 (byte-identical output) verified two ways: (1) the pre-existing golden
tests in tasks.test.ts/orphans.test.ts, which pin exact text output, all pass
unchanged; (2) a new direct test in output.test.ts asserts renderTaskSummaryRows
produces the same bytes for the same row regardless of which command calls it.

/code-review high (workflow-backed): 0 findings -- clean.

Gates: 1439 tests (+6 new in output.test.ts), biome clean, tsc clean,
lore check 0 errors/0 warnings.

Post-review fix (/code-review max, PR 45/46/47/48 pass): orphans.ts:273's `lines.push(...renderTaskSummaryRows(orphanTasks))` spread a large array into a function-call argument list, which has its own engine argument-count ceiling — reintroducing the exact class of stack-overflow bug (RangeError: Maximum call stack size exceeded) this task's refactor was meant to eliminate, just via Array.prototype.push instead of Math.max. Fixed by replacing it with a per-item loop (`for (const row of renderTaskSummaryRows(orphanTasks)) lines.push(row);`), matching the sibling danglingLinks block's existing safe pattern. Re-checked tasks.ts's `[header, ...renderTaskSummaryRows(data.tasks)].join("\n")`: that spreads into an array literal, not a function call, so it has no such ceiling — confirmed empirically (array-literal spread of 1,000,000 items succeeds; push(...) of the same array throws) and left unchanged. Also grepped for any other push(...)/function-call spread this refactor touched — none found outside orphans.ts:273. Added a regression test (test/orphans.test.ts, 'orphan-task block survives a large snapshot') asserting 700,000 orphan tasks render via runOrphans without throwing; verified the test fails with the exact pre-fix RangeError against the old code and passes against the fix, and runs in well under a second. Gates: 1440 tests (+1), biome clean, tsc clean, lore check 0/0.

Merged via PR #46 (8430d3c, squash) into dev, then dev promoted to main. Post-merge /code-review max fold fixed a reintroduced RangeError in orphans.ts's orphan-task block (spread-into-push argument-count ceiling at large scale) before merge.
<!-- SECTION:NOTES:END -->
