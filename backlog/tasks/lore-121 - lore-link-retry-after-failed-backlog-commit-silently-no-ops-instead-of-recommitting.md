---
id: LORE-121
title: >-
  lore link retry after failed backlog commit silently no-ops instead of
  recommitting
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-link
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 135000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runLink (src/commands/link.ts:212-230), a task is skipped and excluded from `editedFiles` whenever its label is already present (`wasPresent`) and its documentation already lists the concept (`!docChanged`). If a prior `lore link` run successfully edited the task file but its subsequent `commitBacklogFiles` call failed (e.g. a rejected pre-commit hook), the on-disk task file is left dirty and uncommitted. Re-running `lore link` for the same task/concept then sees both conditions already satisfied, skips the edit, and passes an empty `editedFiles` to `commitBacklogFiles` (link.ts:247), which delegates to `commitBacklogIfDirty` (src/state.ts:128-138); that function's `pathspecs.length === 0` guard short-circuits before ever running `git status`, so the still-uncommitted backlog/ file is never discovered or committed. The retry reports success with no indication the commit never happened, leaving backlog/ silently dirty until an unrelated `lore sync` sweep happens to catch it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add a regression test in test/link.test.ts that simulates a prior run where the task file was edited (label + doc already applied) but the commit failed, then re-runs `lore link` for the same task/concept and asserts the backlog/ task file is committed by the retry (not skipped as a no-op).
- [ ] #2 When a task is already-present/unchanged but its file is still dirty in the working tree, `lore link` detects and commits that drift (or surfaces an explicit non-zero/drift failure) rather than emitting a success report with `backlogCommit.committed === false`.
- [ ] #3 A `lore link` run where the task was never edited and the file is genuinely clean still results in a true no-op (empty commit, exit 0), preserving current behavior for the non-retry case.
<!-- AC:END -->
