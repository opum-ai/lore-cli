---
id: LCLI-216
title: >-
  Replace tautological tasks/orphans byte-identity test with one exercising both
  command render paths
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:12'
labels:
  - errors-output-git
  - codex-review-followup
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: low
type: task
ordinal: 318000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The test asserting `lore tasks` and `lore orphans` render byte-identical task rows should actually exercise both commands' render paths, so it fails if either command stops using the shared `renderTaskSummaryRows` helper.

**Why:** test/output.test.ts:528-531 constructs one `TaskSummaryRow` and asserts `renderTaskSummaryRows([row])` equals `renderTaskSummaryRows([row])` — the same function called twice on the same input. This is a tautology (`f(x) === f(x)`) that can never detect divergence between the two commands' actual render paths; it gives false confidence in the 'shared row layout' guarantee it names. Both commands do route their task rows through the shared helper today — `renderTable` at src/commands/tasks.ts:296 and the orphans renderer at src/commands/orphans.ts:406 — so a real test can drive those two actual command renderers with equivalent `{id, status, title}` data and assert the produced rows match. The current test would still pass even if `tasks` later inlined its own divergent row formatting.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited output.test.ts:528), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The test drives the actual `lore tasks` row-render path (src/commands/tasks.ts renderTable) and the actual `lore orphans` row-render path (src/commands/orphans.ts) with the same underlying task data.
- [x] #2 The test asserts the task rows produced by the two command render paths are byte-identical.
- [x] #3 The test is designed so it would fail if one command's render path were changed to no longer emit the shared `  <id>  <status>  <title>` row layout (i.e. it is not an f(x)===f(x) tautology).
- [x] #4 All existing output tests continue to pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Read test/output.test.ts:528-531 tautological test and the real render paths (tasks.ts renderTable via runTasks, orphans.ts renderReport via runOrphans). 2. Replace the single test with one that: writes a temp docs bundle + Story linking id LCLI-42 and drives runTasks (plain mode) to get the tasks.ts row; separately drives runOrphans --tasks-only (plain mode) with the same id but no owning doc to get the orphans.ts row. 3. Assert both extracted rows are byte-identical to each other AND to renderTaskSummaryRows's own output for the same {id,status,title}, so it fails if either command's render path stops sharing the helper. 4. Verify via bun test + bun run typecheck; confirm tasks.ts/orphans.ts remain untouched in the diff.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Replaced the f(x)===f(x) tautology (old lines 528-531) with a test that drives BOTH real command entry points: runTasks (src/commands/tasks.ts renderTable, line ~296) via a Story linking LCLI-42, and runOrphans --tasks-only (src/commands/orphans.ts renderReport, line ~406) via the same LCLI-42 with no owning doc. Extracts each command's rendered row for the id from plain-mode stdout and asserts both are byte-identical to each other AND to renderTaskSummaryRows's own output for equivalent {id,status,title} data — so it fails if either command's path stopped routing through the shared helper. Verified: bun test test/output.test.ts -> 61 pass/0 fail; full bun test -> 1923 pass/0 fail; bun run typecheck -> clean; bunx biome check test/output.test.ts -> no issues; git diff --stat confirms src/commands/tasks.ts and src/commands/orphans.ts are UNCHANGED (test-only diff: test/output.test.ts + this backlog task file).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Replaced the tautological renderTaskSummaryRows([row])===renderTaskSummaryRows([row]) test in test/output.test.ts with one that exercises the two commands' real render paths end-to-end: runTasks (tasks.ts renderTable) against a Story linking LCLI-42, and runOrphans --tasks-only (orphans.ts renderReport) against the same LCLI-42 with no owning doc, then asserts the extracted rows are byte-identical to each other and to renderTaskSummaryRows's own output. Verified with bun test (1923 pass/0 fail, including 61/0 in output.test.ts), bun run typecheck (clean), and bunx biome check on the changed file (clean). src/commands/tasks.ts and src/commands/orphans.ts are unchanged — this is a test-only change.
<!-- SECTION:FINAL_SUMMARY:END -->
