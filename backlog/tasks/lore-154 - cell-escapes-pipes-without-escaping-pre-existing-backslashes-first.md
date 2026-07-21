---
id: LORE-154
title: cell() escapes pipes without escaping pre-existing backslashes first
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
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
- [ ] #1 cell() (or its caller) escapes literal backslashes before/consistently with escaping pipes, so a title containing the literal sequence `x\|y` renders as a single well-formed table cell with no stray unescaped pipe.
- [ ] #2 A regression test in test/managed-block.test.ts asserts that a row whose title is the literal string `x\|y` produces a table with the correct number of `|`-delimited columns (i.e. the backslash-pipe sequence does not introduce an extra column).
<!-- AC:END -->
