---
id: LCLI-96
title: Validate/escape argv values passed to backlog CLI to prevent flag injection
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - adapter-backlog
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 110000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Every write/read method in the `BacklogAdapter` (listTasks at line 684, viewTask at 696-698, searchTasks at 722-723, createTask at 746-763, editTask at 781-796) forwards caller-controlled strings (task ids, titles, labels, search queries, status values) straight into the `spawn` argv array with no `--` option-terminator and no rejection of values that begin with `-`. `commaJoin` (line 642) only rejects embedded commas; it does nothing to stop a leading dash. Because Backlog's own CLI parses these argv positions as its flag parser, a value like `-x` or `--force` supplied as an id, title, label, or query is interpreted by `backlog` as a flag rather than literal data, letting an attacker- or bug-controlled string alter or hijack the invoked Backlog command instead of merely naming a task/label/query.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A value beginning with '-' (e.g. a task id, label, title, or search query equal to '-x' or '--force') passed through listTasks/viewTask/searchByLabel/searchTasks/createTask/editTask is either rejected with a validation LoreError before being spawned, or is unambiguously passed as literal data to `backlog` (e.g. via a `--` terminator or equivalent) rather than being interpretable as a flag.
- [x] #2 A regression test added to test/backlog-adapter.test.ts asserts that a dash-prefixed id/title/label/query does not reach the fake spawn's argv as an unescaped/unterminated flag-like token, or is rejected before spawn is invoked.
- [x] #3 Existing valid (non-dash-prefixed) ids, titles, labels, and queries continue to spawn unchanged, so no regression to current passing adapter tests.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add a rejectFlagLike(value) validation helper (mirrors commaJoin's existing 'reject unsafe values' policy) that throws a validation LoreError when a caller-controlled argv value begins with '-'. Apply it at every argv position identified in the finding: listTasks' --status value and (via commaJoin) --labels entries; viewTask's id; searchTasks' query; createTask's title/--description/--milestone/--doc entries and (via commaJoin) --labels entries; editTask's id/--status/--doc entries and (via commaJoin) --add-label/--remove-label entries. commaJoin itself now runs rejectFlagLike over each value before its existing comma check, so searchByLabel (which delegates to listTasks) is covered for free. Add a regression describe block in test/backlog-adapter.test.ts asserting a dash-prefixed id/title/label/status/query is rejected with a validation LoreError before the vulnerable spawn call is ever made (asserting on the fake spawn's recorded calls), plus one no-regression case confirming a valid id still spawns unchanged.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test test/backlog-adapter.test.ts -> 39 pass, 0 fail (added 9 new regression cases under 'flag injection (LCLI-96)'). bun run typecheck -> clean. Full bun test -> 1707 pass, 0 fail (no regressions, no pre-existing failures at base d6abe3b either). bun run lint -> no findings in src/adapters/backlog.ts or test/backlog-adapter.test.ts (4 pre-existing unrelated infos in other test files).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a rejectFlagLike(value) validation helper in src/adapters/backlog.ts that throws a validation LoreError whenever a caller-controlled value begins with '-' before it can reach a spawn() argv position — applied to every site named in the finding: listTasks' --status and (via commaJoin) --labels; viewTask's id; searchTasks' query; createTask's title/--description/--milestone/--doc; editTask's id/--status/--doc and (via commaJoin) --add-label/--remove-label. commaJoin now runs rejectFlagLike per value before its existing comma check, so searchByLabel (delegates to listTasks) is covered too. Rejection happens before the vulnerable spawn call (in most cases before the probe's own spawn calls too), matching the existing fail-loud commaJoin convention rather than attempting a fragile per-call '--' terminator reorder (several call sites push a real flag like --json immediately after the data position, which a terminator would itself swallow). Added a 'flag injection (LCLI-96)' describe block to test/backlog-adapter.test.ts with 9 cases covering every listed method plus a no-regression case for a valid id.
<!-- SECTION:FINAL_SUMMARY:END -->
