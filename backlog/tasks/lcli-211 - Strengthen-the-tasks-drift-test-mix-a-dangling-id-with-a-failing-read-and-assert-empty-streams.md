---
id: LCLI-211
title: >-
  Strengthen the tasks drift test: mix a dangling id with a failing read and
  assert empty streams
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:29'
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
`test/tasks.test.ts`'s 'a Backlog READ failure (drift) propagates as a hard error, never a dangling advisory' test (tasks.test.ts:146-158) under-pins the invariant it names. `commands/tasks.ts`'s `resolveRollup` (tasks.ts:160-179) and the module docstring (tasks.ts:24-28) promise that when a read hard-fails, the first failure in `tasks:` order is rethrown 'before any partial rollup or advisory is emitted' — even when a dangling (null) id is also present in the same run (warnDangling only runs after the in-order loop completes, tasks.ts:177). The current test supplies only a single failing task (LCLI-1) with no dangling task alongside it, and asserts only the rejection type — it never proves that a co-present dangling id's advisory is suppressed, nor that stdout/stderr stay empty on the hard-failure path. This is a test-coverage gap, not a live bug (the invariant holds in the current implementation). Provenance: Codex second-opinion review (backlog doc-2), low-severity finding, cluster cmd-meta-a.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A test drives runTasks on a story whose tasks: list contains BOTH a dangling id (viewTask returns null) AND a failing id (viewTask throws), asserts the call rejects with the hard error, and asserts the captured stdout is empty and the captured stderr is empty (no dangling advisory leaked before the throw).
- [x] #2 The failing-before-dangling and dangling-before-failing orderings are both covered, proving order-independence of the advisory suppression.
- [x] #3 The new test(s) pass against the current implementation (coverage gap, not a bug) and bun test stays green.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Add two tests to test/tasks.test.ts's 'dangling links (soft) vs failures (hard)' describe block, mixing one failing id (LCLI-1, viewTask throws LoreError 'drift') with one dangling id (GONE-9, viewTask resolves null via unseeded fakeAdapter) in a single tasks: list. Cover both orderings (failing-before-dangling, dangling-before-failing). Each asserts runTasks rejects with type 'drift' AND that captured stdout/stderr are both exactly empty (proving warnDangling, which only runs after resolveRollup's in-order loop completes, never fires before the throw). Use a local writeStoryWithSummary helper (frontmatter includes summary:) so the unrelated loadBundle 'missing summary' advisory doesn't pollute the empty-stderr assertion. Verify by sanity-breaking resolveRollup's throw-order temporarily to confirm the new tests catch the regression, then restore and run full bun test + typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added two tests to test/tasks.test.ts's 'dangling links (soft) vs failures (hard)' describe block, both mixing a failing id (LCLI-1, viewTask throws LoreError drift) with a dangling id (GONE-9, unseeded -> viewTask resolves null), covering both tasks: orderings (failing-before-dangling and dangling-before-failing). Each asserts the runTasks() promise rejects with type 'drift' AND that captured stdout.text() === '' and stderr.text() === '' — proving warnDangling (which runs only after resolveRollup's in-order settle loop completes, tasks.ts:177-179) never fires before the throw, regardless of which side of the pair appears first in tasks: order. Added a local writeStoryWithSummary test helper (frontmatter carries summary:) so the unrelated loadBundle 'missing summary' load-time advisory doesn't leak into the empty-stderr assertion; storyDoc/helpers.ts itself was left untouched (pinned to sibling LCLI-205 this wave). Verification: (1) bun test test/tasks.test.ts -> 26 pass, 0 fail, both new tests present and passing against the CURRENT unmodified implementation (coverage gap, not a bug, per task description); (2) sanity check — temporarily patched resolveRollup in src/commands/tasks.ts to only throw the first failure AFTER the loop finishes (i.e. after warnDangling would have run), confirmed BOTH new tests fail with the leaked dangling advisory appearing in stderr.text(), proving the assertions are non-trivial; then reverted src/commands/tasks.ts to the original (git diff clean, byte-identical) and reran -> 26 pass again; (3) full bun test -> 1915 pass, 0 fail, across 47 files; (4) bun run typecheck -> tsc --noEmit clean; (5) bunx biome check test/tasks.test.ts -> no issues (own changed file only; dev biome baseline red-file cleanup is owned by sibling LCLI-195 this wave, left untouched).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the test-coverage gap: test/tasks.test.ts now has two new tests proving resolveRollup's documented invariant (tasks.ts:160-179) — a hard read failure rethrows BEFORE any dangling advisory is emitted, and this holds regardless of whether the dangling id sits before or after the failing id in tasks: order. Both tests assert rejection type 'drift' plus fully empty captured stdout/stderr. Verified via bun test test/tasks.test.ts (26 pass), full bun test (1915 pass/0 fail), bun run typecheck (clean), and a temporary fault-injection sanity check confirming the new assertions would catch a regression. No production code changed (the invariant already held).
<!-- SECTION:FINAL_SUMMARY:END -->
