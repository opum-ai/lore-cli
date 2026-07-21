---
id: LORE-118
title: >-
  query renderText interpolates unsanitized hit id/type/snippet and query text
  into terminal output
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 Concept ids, types, snippets, and the raw query text are sanitized (e.g. control/ANSI escape bytes stripped or escaped) before being placed into renderText's plain/pretty output.
- [ ] #2 A regression test in test/query.test.ts constructs a hit (or query string) containing an ANSI escape sequence (e.g. `\x1b[31m`) or other control character and asserts the rendered text output no longer contains the raw escape/control byte.
<!-- AC:END -->
