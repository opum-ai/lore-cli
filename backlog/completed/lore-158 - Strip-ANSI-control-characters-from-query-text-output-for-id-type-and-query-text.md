---
id: LORE-158
title: >-
  Strip ANSI/control characters from query text output for id, type, and query
  text
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 21:11'
labels:
  - codex-review-followup
  - core-query-validate
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 172000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`renderText()` in src/commands/query.ts (lines 267 and 273) interpolates `data.query` (the user's raw query text) and each hit's `concept.id`/`concept.type` (bundle-controlled, from src/core/query.ts's `toHit()`) directly into the plain/pretty text output with no escaping. The only normalization applied anywhere in this path is `singleLine()` (src/errors.ts:142-144), which collapses newline/paragraph-separator runs but does not strip ANSI escape sequences, OSC sequences, or other control bytes. A crafted concept id/type in the bundle, or a query string containing ANSI escapes, therefore reaches a terminal unsanitized in output that is documented as "ANSI-free" (see the renderText doc comment at query.ts:263).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 renderText() output for a hit whose concept id or type contains ANSI escape sequences (e.g. `\x1b[31m`) or other control characters (e.g. `\x07`, `\x1b]0;title\x07`) has those bytes stripped or escaped before being written, so no raw escape sequence reaches the terminal.
- [x] #2 renderText() output for a `--query` string containing ANSI escape sequences or control characters is likewise sanitized in both the `query "<text>": …` header line and any place the text is echoed.
- [x] #3 A regression test in test/query.test.ts (or the query command's text-output tests) asserts that a hit with an ANSI-escape-laden id/type, and a query string with an embedded ANSI escape, produce output with no raw `\x1b` (or other C0 control) bytes.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirm current src/commands/query.ts renderText()/sanitizeField() already strips ANSI+C0/C1 control bytes from data.query, hit.id, hit.type, hit.snippet (landed via LORE-118, commit 064b3cb) — verify code, not assume.
2. Confirm existing test/query.test.ts LORE-118 regression tests cover --query text and hit type/snippet with embedded ANSI, but none exercises hit.id specifically (concept.id derives from the file path via idFromPath, and POSIX filenames permit raw ESC bytes).
3. Add one regression test in test/query.test.ts: write a bundle file whose relative path itself contains a raw ESC byte (e.g. 'ansi/hack\x1b[31mid.md'), query it, and assert the rendered plain-mode id is stripped of \x1b while remaining otherwise intact.
4. Run bun test test/query.test.ts, full bun test, and bun run typecheck; check off all 3 ACs with this evidence and mark Done.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Found the underlying fix already landed via LORE-118 (commit 064b3cb, 'fix(query): sanitize id/type/snippet/query text before terminal output'): renderText()/sanitizeField() in src/commands/query.ts already compose singleLine() with a local stripAnsiAndControls() and apply it to data.query, hit.id, hit.type, and hit.snippet — this is the same finding (query.ts:264/267/273, doc-2) filed as a second task. output.ts's stripAnsiAndControls (LORE-115) is private/unexported, so query.ts's local twin is the documented, deliberate choice (kept in sync manually per its docstring) — no divergent fork to fix.

Gap found: the existing LORE-118 regression tests cover the --query header text and a hit's frontmatter-sourced type/summary, but none exercised hit.id itself. concept.id derives straight from the file's relative path (idFromPath just POSIX-normalizes + strips .md), and POSIX filenames can carry a raw ESC byte, so I added one regression test in test/query.test.ts: a bundle file whose path contains \x1b[31m, asserting the rendered plain-mode id has \x1b stripped.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
AC1/AC2 (renderText sanitizes ANSI/control bytes on hit id/type and the query header) were already satisfied by LORE-118's fix (src/commands/query.ts sanitizeField()/stripAnsiAndControls(), commit 064b3cb) — verified by reading the current code, not re-implemented. Closed the one AC3 test gap: added a regression test in test/query.test.ts asserting a hit whose id is sourced from an ANSI-escape-laden file path renders with the \x1b byte stripped (the existing LORE-118 tests covered the --query header and frontmatter-sourced type/summary, but not id derived from the path itself). Verified: bun test test/query.test.ts = 51 pass/0 fail; full bun test = 1810 pass/0 fail across 47 files; bun run typecheck exits 0 clean; bunx biome check test/query.test.ts src/commands/query.ts = clean, no fixes.
<!-- SECTION:FINAL_SUMMARY:END -->
