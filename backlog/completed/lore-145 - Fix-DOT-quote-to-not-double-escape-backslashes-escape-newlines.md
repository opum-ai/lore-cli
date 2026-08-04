---
id: LORE-145
title: Fix DOT quote() to not double-escape backslashes; escape newlines
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 20:33'
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

**Correction (2026-07-22, Fable review):** The premise above is empirically wrong and was superseded. Graphviz 15.1.0 was installed and real `dot`/`dot -Tsvg` output was exercised: Graphviz's quoted-ID lexer (`lib/cgraph/scan.l`) recognizes exactly two escapes inside a quoted string — `\"` and `\\` — and otherwise **drops** an unescaped backslash before any other character (or, for `\\` immediately followed by `"`, terminates the string early). So doubling every backslash was the *correct* escString encoding all along, not a bug; removing it (as this task originally directed) produces DOT that `dot` either rejects outright (trailing backslash; backslash-before-quote) or silently corrupts (backslash dropped, or a literal `\n` inside a value misread as a line break). The only genuine defect this task fixes is the missing embedded-newline handling (AC2 below). `quote()` must: (1) double every literal backslash (`\` → `\\`) **first**, (2) then escape an embedded newline as `\n`, (3) then escape `"` as `\"` — in that order, so the backslashes injected by steps 2–3 are not themselves re-doubled by step 1.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 `quote()` escapes a literal backslash by doubling it (`\` -> `\\`) *before* injecting any other escape, matching Graphviz's real escString encoding (`lib/cgraph/scan.l`: exactly two recognized escapes, `\"` and `\\`; any other backslash is dropped) -- so a value containing a backslash, including one ending in a backslash or one immediately preceding a `"`, produces DOT that `dot` parses without error and renders pixel-faithfully (verified against real graphviz 15.1.0 via `dot -Tcanon` and `dot -Tsvg`)
- [x] #2 A value containing an embedded newline is escaped (e.g. rendered as `\n`) so the emitted DOT for that node/edge stays a single well-formed quoted ID
- [x] #3 test/graph.test.ts gains regression cases asserting `toDot()` output for a title/id containing a backslash (doubled), a title ending in a literal backslash, a title with a backslash immediately before a `"`, and a title containing a newline -- all four verified to parse under real graphviz (`dot -Tcanon`)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rewrite quote() in src/core/graph.ts: stop doubling every backslash (DOT's quoted-ID grammar only requires escaping a literal double-quote as \"; a lone backslash, even before another backslash, is left unchanged by Graphviz's parser). 2. Escape an embedded newline/line-separator control char (\r\n, \r, \n, U+2028, U+2029) as the literal two-char DOT escape \\n (same convention Graphviz uses to force a label line break) instead of relying on singleLine()'s space-collapse, so a multi-line value still renders as one well-formed quoted DOT statement without losing the line-break signal. Drop the now-unused singleLine import from core/graph.ts (renderText()/commands/graph.ts keep using singleLine for the plain-text listing, unaffected). 3. Update the doc comment on quote() to state the correct DOT escaping rule instead of the false 'only two characters' premise. 4. Update test/graph.test.ts: fix the existing 'escapes quotes and backslashes' case to expect a single (not doubled) backslash, and change the embedded-newline DOT test to expect the \\n escape instead of a collapsed space; add a dedicated backslash round-trip regression case (e.g. a Windows-style path) per AC1/AC3. 5. Verify: bun test (full suite) + bun run typecheck, both green.

**Correction (2026-07-22, Fable review — reopened and re-fixed under the same task):** Step 1 above was empirically wrong (see description correction) and was reverted. The corrected plan actually implemented:
1. quote() now escapes `\` -> `\\` FIRST (restoring the pre-task doubling behavior, which was correct all along), then `\r\n|\r|\n` -> `\n` (the one genuine improvement, AC2), then `"` -> `\"` -- order matters so the injected `\\`/`\"`/`\n` escapes are not themselves re-doubled by the backslash step.
2. Rewrote the quote() doc comment to cite Graphviz's real lexer (`lib/cgraph/scan.l`: exactly two escapes, `\"` and `\\`; an unescaped `\` before any other char is dropped) instead of the false "only two characters, backslash isn't one" premise.
3. Fixed the two existing backslash-bearing tests in test/graph.test.ts to expect doubled backslashes, and added two new regression cases: a title ending in a literal backslash, and a title with `\` immediately before `"` -- both are the two syntax-error classes graphviz 15.1.0 rejected under the reverted (buggy) behavior.
4. Verified against real graphviz 15.1.0: every case's `toDot()` output parses clean under `dot -Tcanon` and renders pixel-faithfully under `dot -Tsvg` (not just re-parsed -- the rendered `<text>` content was diffed against the source value).
5. Known gap, carried forward rather than fixed here: the original plan (above) promised escaping the Unicode line/paragraph separator characters U+2028 and U+2029 alongside \r\n|\r|\n; the shipped regex only ever handled the three ASCII newline forms. This is harmless for DOT well-formedness (U+2028/U+2029 are not DOT line terminators, so a value containing one still emits as a single physical line -- dot parses it fine, just displays the raw separator character rather than a forced break), but it is a real plan/implementation mismatch. Left unfixed to keep this correction's blast radius minimal; a future task should fold U+2028/U+2029 into the newline-escaping regex if that handling is wanted.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
First pass rewrote quote() (src/core/graph.ts) to stop doubling backslashes; a Fable reviewer installed real graphviz 15.1.0 and fed the emitted DOT through `dot`, empirically disproving that premise: a trailing backslash or a backslash immediately before a `"` produced DOT `dot` rejects with a syntax error, and every other backslash-bearing label silently corrupted (backslash dropped, or a literal `\n` in a value misread as a forced line break) -- because Graphviz's quoted-ID lexer (`lib/cgraph/scan.l`) recognizes exactly two escapes, `\"` and `\\`, and drops an unescaped backslash before anything else. Doubling was the correct escString encoding all along.

Reopened and re-fixed under this same task (not a new task): quote() now escapes `\` -> `\\` FIRST, then `\r\n|\r|\n` -> `\n`, then `"` -> `\"` -- order matters so the doubling doesn't re-double the injected `\n`/`\"` escapes. Doc comment rewritten to cite the real Graphviz lexer instead of the disproven "only two characters, backslash isn't one" premise. Reverted the two backslash tests to expect doubled backslashes and added two new regression cases (trailing backslash; backslash-before-quote) -- the exact two syntax-error classes the reviewer found. Every backslash-bearing case in test/graph.test.ts was independently verified against real graphviz 15.1.0: each `toDot()` output parses clean under `dot -Tcanon` and its rendered `<text>` (via `dot -Tsvg`) matches the source value exactly, confirmed by generating each case's actual DOT, running it through the installed `dot` binary, and diffing the SVG text content against the expected label. The embedded-newline improvement (AC2, unaffected by the regression) was kept as-is. Known gap carried forward: the plan's promised U+2028/U+2029 line-separator handling was never implemented (regex only covers \r\n|\r|\n); harmless for DOT well-formedness since neither is a DOT line terminator, but noted for any future rework.

Verified: bun test -- 1797 pass, 0 fail, 5072 expect() calls across 47 files; bun run typecheck -- 0 errors; bunx biome check src/core/graph.ts test/graph.test.ts -- 0 findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
quote() (src/core/graph.ts) now doubles a literal backslash (`\` -> `\\`) FIRST, then escapes an embedded newline as `\n`, then escapes `"` as `\"` -- this matches Graphviz's real escString encoding (its lexer, `lib/cgraph/scan.l`, recognizes only `\"` and `\\` and drops any other backslash), superseding a first pass that removed backslash-doubling on a since-disproven premise (a Fable reviewer showed, against real graphviz 15.1.0, that removing the doubling made `dot` reject a trailing-backslash or backslash-before-quote value outright, and corrupt every other backslash-bearing label). The embedded-newline handling (-> `\n`) is unchanged and correct. Verified with bun test (1797 pass, 0 fail, 47 files), bun run typecheck (0 errors), bunx biome check on both touched files (0 findings), and directly against real graphviz 15.1.0: every backslash/newline test case's `toDot()` output parses under `dot -Tcanon` and its `dot -Tsvg` rendered label text matches the source value exactly, including the two previously-rejected classes (trailing backslash; backslash immediately before a quote), both now covered by dedicated regression tests.
<!-- SECTION:FINAL_SUMMARY:END -->
