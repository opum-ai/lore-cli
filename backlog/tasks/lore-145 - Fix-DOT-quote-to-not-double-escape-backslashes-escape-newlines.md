---
id: LORE-145
title: Fix DOT quote() to not double-escape backslashes; escape newlines
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 20:17'
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
- [x] #1 `quote()` no longer doubles literal backslash characters in the output DOT string; a value containing a backslash round-trips through `toDot()` unchanged except for the required `\"` escaping
- [x] #2 A value containing an embedded newline is escaped (e.g. rendered as `\\n`) so the emitted DOT for that node/edge stays a single well-formed quoted ID
- [x] #3 test/graph.test.ts gains a regression case asserting `toDot()` output for a title/id containing a backslash and for one containing a newline
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite quote() in src/core/graph.ts: stop doubling every backslash (DOT's quoted-ID grammar only requires escaping a literal double-quote as \"; a lone backslash, even before another backslash, is left unchanged by Graphviz's parser). 2. Escape an embedded newline/line-separator control char (\r\n, \r, \n, U+2028, U+2029) as the literal two-char DOT escape \\n (same convention Graphviz uses to force a label line break) instead of relying on singleLine()'s space-collapse, so a multi-line value still renders as one well-formed quoted DOT statement without losing the line-break signal. Drop the now-unused singleLine import from core/graph.ts (renderText()/commands/graph.ts keep using singleLine for the plain-text listing, unaffected). 3. Update the doc comment on quote() to state the correct DOT escaping rule instead of the false 'only two characters' premise. 4. Update test/graph.test.ts: fix the existing 'escapes quotes and backslashes' case to expect a single (not doubled) backslash, and change the embedded-newline DOT test to expect the \\n escape instead of a collapsed space; add a dedicated backslash round-trip regression case (e.g. a Windows-style path) per AC1/AC3. 5. Verify: bun test (full suite) + bun run typecheck, both green.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote quote() in src/core/graph.ts: only \" is escaped now (a lone backslash, including one immediately before another backslash or before the appended \", round-trips through Graphviz's real quoted-ID lexer unchanged — proven by the round-trip argument in the doc comment); an embedded newline/CRLF/CR is now escaped as the literal \n DOT line-break escape instead of being collapsed to a space, so multi-line values stay a single well-formed quoted statement without losing the line-break signal. Dropped the now-unused singleLine import from core/graph.ts (renderText()/commands/graph.ts still use singleLine for the plain-text listing — untouched, out of scope). Updated test/graph.test.ts: fixed the pre-existing backslash+quote case to expect a single (not doubled) backslash, added a dedicated Windows-path backslash round-trip regression, and changed the embedded-newline DOT case to expect the \n escape instead of a collapsed space.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed quote() (src/core/graph.ts) to stop doubling literal backslashes (DOT's quoted-ID grammar escapes only \"; all other characters including \ are left unchanged by Graphviz's parser) and to escape an embedded newline as the two-character \n DOT escape instead of relying on singleLine's space-collapse. Verified with bun test (1795 pass, 0 fail across 47 files) and bun run typecheck (0 errors); bunx biome check on the two touched files reports 0 findings. test/graph.test.ts gained a fixed backslash+quote assertion, a new backslash round-trip regression (Windows-style path), and an updated embedded-newline assertion — all three acceptance criteria verified by these tests.
<!-- SECTION:FINAL_SUMMARY:END -->
