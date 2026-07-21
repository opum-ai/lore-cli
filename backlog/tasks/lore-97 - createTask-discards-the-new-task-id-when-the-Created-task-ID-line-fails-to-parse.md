---
id: LORE-97
title: >-
  createTask discards the new task id when the 'Created task <ID>' line fails to
  parse
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
ordinal: 111000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `createTask` (src/adapters/backlog.ts:763-778), after `backlog task create` exits 0 — meaning the task was genuinely created in Backlog — the new id is extracted from stdout via `CREATED_ID.exec(result.stdout)?.[1]`. If that regex fails to match, `readDrift(...)` is called at line 776, which per its `never` return type unconditionally throws a `LoreError('drift', ...)`. Because the task was already created before this point, the caller loses any way to learn or recover the new task's real id: the error surfaces as a total failure even though Backlog-side state now has an orphaned, unreferenced task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 When `backlog task create` exits 0 but its stdout does not match `CREATED_ID`, the thrown/reported error (or an alternative recovery path) surfaces enough information — e.g. the raw stdout or a follow-up lookup — that the caller is not left with a task silently created but wholly unreferenceable.
- [ ] #2 A regression test added to test/backlog-adapter.test.ts exercises a fake spawn returning exitCode 0 with stdout that lacks a 'Created task <ID>' line and asserts on the resulting behavior (error content and/or recovered id), not just that some error is thrown.
<!-- AC:END -->
