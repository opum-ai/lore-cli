---
id: LORE-211
title: >-
  Strengthen the tasks drift test: mix a dangling id with a failing read and
  assert empty streams
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - cmd-meta-a
  - codex-review-followup
  - test-coverage
dependencies: []
priority: low
type: task
ordinal: 313000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`test/tasks.test.ts`'s 'a Backlog READ failure (drift) propagates as a hard error, never a dangling advisory' test (tasks.test.ts:146-158) under-pins the invariant it names. `commands/tasks.ts`'s `resolveRollup` (tasks.ts:160-179) and the module docstring (tasks.ts:24-28) promise that when a read hard-fails, the first failure in `tasks:` order is rethrown 'before any partial rollup or advisory is emitted' — even when a dangling (null) id is also present in the same run (warnDangling only runs after the in-order loop completes, tasks.ts:177). The current test supplies only a single failing task (LORE-1) with no dangling task alongside it, and asserts only the rejection type — it never proves that a co-present dangling id's advisory is suppressed, nor that stdout/stderr stay empty on the hard-failure path. This is a test-coverage gap, not a live bug (the invariant holds in the current implementation). Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A test drives runTasks on a story whose tasks: list contains BOTH a dangling id (viewTask returns null) AND a failing id (viewTask throws), asserts the call rejects with the hard error, and asserts the captured stdout is empty and the captured stderr is empty (no dangling advisory leaked before the throw).
- [ ] #2 The failing-before-dangling and dangling-before-failing orderings are both covered, proving order-independence of the advisory suppression.
- [ ] #3 The new test(s) pass against the current implementation (coverage gap, not a bug) and bun test stays green.
<!-- AC:END -->
