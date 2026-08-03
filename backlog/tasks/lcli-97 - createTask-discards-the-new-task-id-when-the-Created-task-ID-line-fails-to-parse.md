---
id: LCLI-97
title: >-
  createTask discards the new task id when the 'Created task <ID>' line fails to
  parse
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:10'
labels:
  - codex-review-followup
  - adapter-backlog
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
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `createTask` (src/adapters/backlog.ts:763-778), after `backlog task create` exits 0 — meaning the task was genuinely created in Backlog — the new id is extracted from stdout via `CREATED_ID.exec(result.stdout)?.[1]`. If that regex fails to match, `readDrift(...)` is called at line 776, which per its `never` return type unconditionally throws a `LoreError('drift', ...)`. Because the task was already created before this point, the caller loses any way to learn or recover the new task's real id: the error surfaces as a total failure even though Backlog-side state now has an orphaned, unreferenced task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 When `backlog task create` exits 0 but its stdout does not match `CREATED_ID`, the thrown/reported error (or an alternative recovery path) surfaces enough information — e.g. the raw stdout or a follow-up lookup — that the caller is not left with a task silently created but wholly unreferenceable.
- [x] #2 A regression test added to test/backlog-adapter.test.ts exercises a fake spawn returning exitCode 0 with stdout that lacks a 'Created task <ID>' line and asserts on the resulting behavior (error content and/or recovered id), not just that some error is thrown.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In createTask (src/adapters/backlog.ts), when 'backlog task create' exits 0 but CREATED_ID fails to match stdout, pass raw stdout + title as readDrift's input (instead of no context) so the thrown LoreError's input echoes enough to recover the orphaned task (e.g. search by title). 2. Add a regression test in test/backlog-adapter.test.ts with a fake spawn returning exitCode 0 and stdout lacking the Created-task line, asserting err.input contains the raw stdout (not just that some error was thrown). 3. Verify: bun test test/backlog-adapter.test.ts, bun run typecheck, full bun test suite for new regressions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: createTask now passes {title, stdout} as readDrift's input when CREATED_ID fails to match post-exit-0 stdout, so the thrown LoreError (type=drift) echoes the raw stdout and title instead of leaving zero trace of the orphaned task. Verification: bun test test/backlog-adapter.test.ts -> 40 pass/0 fail (new regression test asserts err.input matches {title, stdout} exactly, not just that an error was thrown); bun run typecheck -> clean; full bun test -> 1713 pass/0 fail (no new failures vs base 19a3705).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
createTask (src/adapters/backlog.ts) no longer discards diagnostic info when `backlog task create` exits 0 but stdout lacks a parseable `Created task <ID>` line: readDrift is now called with {title, stdout} as its input, so the thrown LoreError's echoed input carries the raw create stdout and the title Backlog was given, letting a caller recover the orphaned task (e.g. search Backlog by title) instead of losing all trace of it. Added a regression test in test/backlog-adapter.test.ts driving a fake spawn that exits 0 with non-matching stdout and asserting err.input matches {title, stdout} exactly. Verified via bun test test/backlog-adapter.test.ts (40 pass), bun run typecheck (clean), and full bun test (1713 pass/0 fail, no regressions).
<!-- SECTION:FINAL_SUMMARY:END -->
