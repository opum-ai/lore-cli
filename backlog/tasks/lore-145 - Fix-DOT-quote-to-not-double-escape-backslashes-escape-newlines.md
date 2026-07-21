---
id: LORE-145
title: Fix DOT quote() to not double-escape backslashes; escape newlines
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-engine-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 159000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`quote()` in src/core/graph.ts (used by `toDot()` to render node/edge labels for `lore graph --dot`) replaces every backslash with two backslashes before wrapping in quotes. Per the DOT language spec, `\"` is the only escape sequence a double-quoted ID needs; all other characters, including `\`, are left unchanged by Graphviz's parser, so this doubling corrupts any id, title, or edge kind containing a literal backslash (e.g. a Windows-style path fragment) when the output is fed to `dot`. The function also performs no handling of embedded newlines in labels, which will break or visually mangle the emitted DOT. The doc comment on line 161 asserts backslash-escaping is one of "the only two DOT requires," which is the same incorrect premise driving the bug.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `quote()` no longer doubles literal backslash characters in the output DOT string; a value containing a backslash round-trips through `toDot()` unchanged except for the required `\"` escaping
- [ ] #2 A value containing an embedded newline is escaped (e.g. rendered as `\\n`) so the emitted DOT for that node/edge stays a single well-formed quoted ID
- [ ] #3 test/graph.test.ts gains a regression case asserting `toDot()` output for a title/id containing a backslash and for one containing a newline
<!-- AC:END -->
