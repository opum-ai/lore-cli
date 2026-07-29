---
id: LORE-118
title: >-
  query renderText interpolates unsanitized hit id/type/snippet and query text
  into terminal output
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 17:05'
labels:
  - codex-review-followup
  - cmd-crud-b
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 132000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
renderText in src/commands/query.ts:266-279 builds the plain/pretty `lore query` output by directly interpolating `data.query`, `hit.id`, `hit.type`, and `hit.snippet` into template strings with no escaping. The only sanitizer available in the codebase, `singleLine()` (src/errors.ts:142-144), strips just CR/LF/U+2028/U+2029 line-terminator characters and is not even called on these fields — it leaves other control and ANSI escape bytes untouched. A concept id, type, or snippet (or a raw `--query` string) containing ANSI escape sequences or other control characters is emitted verbatim to the terminal, which can rewrite terminal state, spoof preceding output, or hide/alter subsequent output when piped to a terminal.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Concept ids, types, snippets, and the raw query text are sanitized (e.g. control/ANSI escape bytes stripped or escaped) before being placed into renderText's plain/pretty output.
- [x] #2 A regression test in test/query.test.ts constructs a hit (or query string) containing an ANSI escape sequence (e.g. `\x1b[31m`) or other control character and asserts the rendered text output no longer contains the raw escape/control byte.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Sanitize hit.id/hit.type/hit.snippet and data.query in renderText (src/commands/query.ts) before interpolation: singleLine() (from errors.ts) composed with a local ANSI/control-stripping helper matching output.ts's stripAnsiAndControls pattern (not exported there, so duplicated locally per file-scope constraint).
2. Add a private sanitizeField() in query.ts applied to all 4 interpolated fields in renderText.
3. Add regression tests in test/query.test.ts: a --query positional with an embedded ANSI escape, and a concept with frontmatter type/summary containing an ANSI escape (via YAML \u001b unicode escape), asserting the raw ESC byte does not survive into plain-mode output.
4. Verify: bun test test/query.test.ts, full bun test, bun run typecheck.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Sanitized renderText's four interpolated fields (data.query, hit.id, hit.type, hit.snippet) via a new sanitizeField() (src/commands/query.ts) composing singleLine() (errors.ts) with a stripAnsiAndControls() helper mirroring output.ts's LORE-115 pattern — duplicated locally (not imported) because output.ts's version isn't exported and this task's file scope is restricted to commands/query.ts + test/query.test.ts. Added 2 regression tests in test/query.test.ts: an ANSI escape in the raw --query text, and ANSI escapes in a hit's type/summary frontmatter (embedded via a YAML unicode escape so js-yaml parses a real ESC byte) — both assert the rendered plain-mode output no longer contains \x1b. Verified: bun test test/query.test.ts = 50 pass/0 fail; full bun test = 1740 pass/0 fail across 46 files; bun run typecheck exits 0. bunx biome check on both changed files: clean.
<!-- SECTION:FINAL_SUMMARY:END -->
