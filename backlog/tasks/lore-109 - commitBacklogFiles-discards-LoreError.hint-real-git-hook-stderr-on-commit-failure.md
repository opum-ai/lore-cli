---
id: LORE-109
title: >-
  commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit
  failure
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - cli-entry-state
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 123000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/state.ts's commitBacklogFiles (around line 251-260), the catch for a `drift`-typed LoreError from a failed git add/commit captures only `err.message` into `BacklogCommitResult.error`, dropping `err.hint`. The `run()` helper (lines 360-372) populates that hint via stderrHint(result.stderr), carrying the actual git/hook stderr reason (e.g. a rejected pre-commit hook's real output). Since renderBacklogCommitLine (lines 102-111) only ever prints `commit.error`, users see a generic 'exited N' failure message with no indication of the underlying git/hook cause, making failures hard to diagnose.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 BacklogCommitResult's error field (or a new field) preserves the LoreError's hint text from a failed git add/commit, not just its message.
- [ ] #2 renderBacklogCommitLine's output for a failed commit includes the captured hint/stderr reason (e.g. the pre-commit hook's actual stderr text), not just the generic 'git commit exited N' message.
- [ ] #3 A new test in test/state.test.ts simulates a git commit failure with a non-empty stderr (e.g. a hook rejection message) and asserts the hint text is present in the returned BacklogCommitResult and/or the rendered commit line output.
<!-- AC:END -->
