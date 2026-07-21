---
id: LORE-125
title: resolveRollup doesn't verify viewTask's returned id matches the requested id
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cmd-meta-a
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 139000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/commands/tasks.ts, resolveRollup (line 158) builds each TaskRollupRow directly from result.value.id/title/status with no comparison against linked[i], the id that was actually requested at that position. If adapter.viewTask ever returns a detail for a different task than requested, the rollup would silently attribute another task's title/status to the requested row, with no check anywhere else in resolveRollup (lines 133-165) to catch it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 resolveRollup treats a BacklogTaskDetail whose id does not case-insensitively match the requested linked[i] id as a hard failure (thrown error) rather than pushing it into rows.
- [ ] #2 A regression test in test/tasks.test.ts uses a stub adapter whose viewTask returns a detail with a mismatched id, asserting the mismatch is surfaced as an error rather than silently included in the rollup.
<!-- AC:END -->
