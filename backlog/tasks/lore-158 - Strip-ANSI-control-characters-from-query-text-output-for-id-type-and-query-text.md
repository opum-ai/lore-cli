---
id: LORE-158
title: >-
  Strip ANSI/control characters from query text output for id, type, and query
  text
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 renderText() output for a hit whose concept id or type contains ANSI escape sequences (e.g. `\x1b[31m`) or other control characters (e.g. `\x07`, `\x1b]0;title\x07`) has those bytes stripped or escaped before being written, so no raw escape sequence reaches the terminal.
- [ ] #2 renderText() output for a `--query` string containing ANSI escape sequences or control characters is likewise sanitized in both the `query "<text>": …` header line and any place the text is echoed.
- [ ] #3 A regression test in test/query.test.ts (or the query command's text-output tests) asserts that a hit with an ANSI-escape-laden id/type, and a query string with an embedded ANSI escape, produce output with no raw `\x1b` (or other C0 control) bytes.
<!-- AC:END -->
