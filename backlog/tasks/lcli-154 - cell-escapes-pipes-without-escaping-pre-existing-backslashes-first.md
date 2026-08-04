---
id: LCLI-154
title: cell() escapes pipes without escaping pre-existing backslashes first
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-managed-template
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
ordinal: 168000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
cell() in src/core/managed-block.ts (currently lines 315-317) escapes `|` to `\|` but never escapes literal backslashes, and does so in the wrong order relative to any backslash handling. A value that already contains a literal backslash immediately before a pipe (e.g. a task title `x\|y`) becomes `x\\|y` after the pipe substitution — which CommonMark parses as an escaped backslash followed by a live, cell-delimiting pipe, silently breaking the generated Markdown table's column alignment for that row. This is a table-corruption bug for any task/agent title containing a literal `\|` sequence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 cell() (or its caller) escapes literal backslashes before/consistently with escaping pipes, so a title containing the literal sequence `x\|y` renders as a single well-formed table cell with no stray unescaped pipe.
- [x] #2 A regression test in test/managed-block.test.ts asserts that a row whose title is the literal string `x\|y` produces a table with the correct number of `|`-delimited columns (i.e. the backslash-pipe sequence does not introduce an extra column).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/managed-block.ts cell(), add a backslash-escape step (replace literal \\ -> \\\\) BEFORE the existing pipe-escape step (| -> \\|), so pre-existing backslashes are doubled first and the subsequent pipe-escape's newly-introduced backslash is not itself re-escaped. Update the doc comment above cell() to describe the new defense and the ordering rationale.
2. Add a regression test in test/managed-block.test.ts: a row with title 'x\\|y' (literal backslash-pipe-y) must render as a single well-formed cell with no stray unescaped pipe -- assert the rendered row has the correct column count (exactly 3 pipes delimiting the 3-column row) and that the escaped form round-trips visually to the literal x\\|y sequence.
3. Run bun test and bun run typecheck; confirm full pass; mark task Done with notes citing exact counts.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
cell() (src/core/managed-block.ts) now escapes literal backslashes (\\ -> \\\\) BEFORE escaping pipes (| -> \\|), so a pre-existing backslash directly before a pipe cannot combine with the pipe-escape's inserted backslash into a live delimiter. Added regression test in test/managed-block.test.ts (title 'x\\|y') asserting the rendered row has exactly 4 real (unescaped) column-delimiting pipes and that the cell renders as x\\\\\\|y (backslash-doubled, pipe-escaped) round-tripping to the literal x\\|y. Verified: bun test -> 1795 pass, 0 fail, 5072 expect() calls; bun run typecheck -> clean (tsc --noEmit, no output/errors). No docs/ files changed, so lore check was not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed cell() in src/core/managed-block.ts to escape literal backslashes before escaping pipes, preventing a pre-existing backslash-pipe sequence (e.g. title 'x\|y') from producing an extra live table-delimiting pipe. Added a regression test in test/managed-block.test.ts with a countUnescapedPipes helper that verifies the row keeps exactly 4 real delimiter pipes. Verified with bun test (1795 pass, 0 fail) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
