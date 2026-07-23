---
id: LORE-216
title: >-
  Replace tautological tasks/orphans byte-identity test with one exercising both
  command render paths
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - errors-output-git
  - codex-review-followup
dependencies: []
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
- [ ] #1 The test drives the actual `lore tasks` row-render path (src/commands/tasks.ts renderTable) and the actual `lore orphans` row-render path (src/commands/orphans.ts) with the same underlying task data.
- [ ] #2 The test asserts the task rows produced by the two command render paths are byte-identical.
- [ ] #3 The test is designed so it would fail if one command's render path were changed to no longer emit the shared `  <id>  <status>  <title>` row layout (i.e. it is not an f(x)===f(x) tautology).
- [ ] #4 All existing output tests continue to pass.
<!-- AC:END -->
