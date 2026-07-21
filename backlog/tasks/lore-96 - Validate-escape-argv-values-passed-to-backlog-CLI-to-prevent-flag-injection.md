---
id: LORE-96
title: Validate/escape argv values passed to backlog CLI to prevent flag injection
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A value beginning with '-' (e.g. a task id, label, title, or search query equal to '-x' or '--force') passed through listTasks/viewTask/searchByLabel/searchTasks/createTask/editTask is either rejected with a validation LoreError before being spawned, or is unambiguously passed as literal data to `backlog` (e.g. via a `--` terminator or equivalent) rather than being interpretable as a flag.
- [ ] #2 A regression test added to test/backlog-adapter.test.ts asserts that a dash-prefixed id/title/label/query does not reach the fake spawn's argv as an unescaped/unterminated flag-like token, or is rejected before spawn is invoked.
- [ ] #3 Existing valid (non-dash-prefixed) ids, titles, labels, and queries continue to spawn unchanged, so no regression to current passing adapter tests.
<!-- AC:END -->
