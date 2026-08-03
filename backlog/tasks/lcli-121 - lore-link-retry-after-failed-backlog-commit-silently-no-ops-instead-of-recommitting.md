---
id: LCLI-121
title: >-
  lore link retry after failed backlog commit silently no-ops instead of
  recommitting
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - cmd-link
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
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
- [x] #1 Add a regression test in test/link.test.ts that simulates a prior run where the task file was edited (label + doc already applied) but the commit failed, then re-runs `lore link` for the same task/concept and asserts the backlog/ task file is committed by the retry (not skipped as a no-op).
- [x] #2 When a task is already-present/unchanged but its file is still dirty in the working tree, `lore link` detects and commits that drift (or surfaces an explicit non-zero/drift failure) rather than emitting a success report with `backlogCommit.committed === false`.
- [x] #3 A `lore link` run where the task was never edited and the file is genuinely clean still results in a true no-op (empty commit, exit 0), preserving current behavior for the non-retry case.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In runLink's per-task back-ref loop (link.ts), push detail.file into editedFiles in the already-present (wasPresent && !docChanged) early-return branch too, not just after a successful editTask.
2. This makes commitBacklogFiles's own git-status check (scoped to that path) decide whether there is real leftover drift to stage/commit, instead of short-circuiting on an empty pathspec list.
3. Failed-edit paths still push nothing (exception thrown before any push), preserving the existing partial-failure commit scoping test.
4. Update test/link.test.ts: replace the old 'fully idempotent... does not commit' test (which encoded the bug) with an AC#3 clean-tree true-no-op test and a new AC#1/#2 dirty-retry-recommits test.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: in runLink's per-task back-ref loop (link.ts), the already-present early-return (wasPresent && !docChanged) now also pushes detail.file into editedFiles before returning, instead of skipping it entirely. This makes commitBacklogFiles's own git-status check (scoped to that exact path) discover and commit leftover drift from a prior run whose edit succeeded but whose commit failed (e.g. rejected pre-commit hook) — the retry now recommits instead of silently no-opping. A failed editTask call still pushes nothing (exception thrown before either push site), so the existing partial-failure commit scoping is unchanged. state.ts was NOT touched — commitBacklogIfDirty's guard is untouched, per the task's preferred approach.
Tests: replaced the old 'fully idempotent... does not commit' test (which asserted the buggy no-op-despite-dirty behavior) with two tests — an AC#3 clean-tree true-no-op test (cleanGitSpawn, backlogCommit: {committed:false, files:[]}) and a new AC#1/#2 dirty-retry test (dirtyGitSpawn on the task's own file, already-present + adapter.calls==0, asserts backlogCommit: {committed:true, files:[DIRTY_PATH]} with the same scoped git status/add/commit pathspec sequence as a normal edit's commit).
Verification: bun test test/link.test.ts -> 60 pass, 0 fail (222 expect() calls). Full bun test -> 1730 pass, 0 fail across 45 files. bun run typecheck (tsc --noEmit) -> clean, exit 0. bunx biome check src/commands/link.ts test/link.test.ts -> no issues.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the lore link retry-after-failed-commit silent no-op: the already-present/unchanged branch in runLink now includes the task's file path as a commit candidate, so commitBacklogFiles's git-status check discovers and commits any leftover uncommitted drift from a prior failed commit, while a genuinely clean tree still no-ops. Verified: bun test test/link.test.ts (60 pass/0 fail), full bun test (1730 pass/0 fail, 45 files), bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
