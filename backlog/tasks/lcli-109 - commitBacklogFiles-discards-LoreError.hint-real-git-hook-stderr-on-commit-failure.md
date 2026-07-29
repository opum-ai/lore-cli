---
id: LCLI-109
title: >-
  commitBacklogFiles discards LoreError.hint (real git/hook stderr) on commit
  failure
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:25'
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
- [x] #1 BacklogCommitResult's error field (or a new field) preserves the LoreError's hint text from a failed git add/commit, not just its message.
- [x] #2 renderBacklogCommitLine's output for a failed commit includes the captured hint/stderr reason (e.g. the pre-commit hook's actual stderr text), not just the generic 'git commit exited N' message.
- [x] #3 A new test in test/state.test.ts simulates a git commit failure with a non-empty stderr (e.g. a hook rejection message) and asserts the hint text is present in the returned BacklogCommitResult and/or the rendered commit line output.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add optional hint field to BacklogCommitResult (src/state.ts), documented alongside error.
2. In commitBacklogFiles's catch block, capture err.hint into the returned result alongside err.message.
3. Update renderBacklogCommitLine to append the hint in parens after the error message (matching the existing '(...)' suffix convention used elsewhere, e.g. rename.ts's back-ref line), only when hint is present.
4. Extend/add test(s) in test/state.test.ts: assert commitBacklogFiles's result.hint contains the stderr-derived hint text on a git commit failure with non-empty stderr, and assert renderBacklogCommitLine's rendered output includes that hint text.
5. Run bun run typecheck && bun test; fix any regressions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added optional BacklogCommitResult.hint field; commitBacklogFiles's catch now captures err.hint alongside err.message; renderBacklogCommitLine appends the hint in parens after the failure message (matching the existing suffix convention used in rename.ts's back-ref line). Added a regression test in test/state.test.ts asserting a simulated git-commit stderr (pre-commit hook rejection) survives into result.hint and into renderBacklogCommitLine's rendered output. Verified: bun run typecheck clean (tsc --noEmit, no errors); bun test: 1719 pass, 0 fail, 4843 expect() calls across 45 files (full suite, including the new test).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
commitBacklogFiles's catch now captures LoreError.hint into a new BacklogCommitResult.hint field (alongside .error), and renderBacklogCommitLine appends it in parens after the failure message so a caller sees the real git/hook stderr reason instead of only a generic 'exited N'. Verified with bun run typecheck (clean) and the full bun test suite (1719 pass, 0 fail, 4843 expect() calls across 45 files), including a new regression test simulating a pre-commit-hook rejection's stderr.
<!-- SECTION:FINAL_SUMMARY:END -->
