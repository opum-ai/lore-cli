---
id: LORE-161
title: >-
  Resource-drift finding message embeds raw frontmatter value unsanitized in CLI
  output
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
ordinal: 175000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`resourceDriftFindings()` in src/core/validate.ts:304-310 builds `finding.message` by directly interpolating the bundle-authored `resource` frontmatter string (`actual`) and the computed `expected` value into a template literal (`resource "${actual}" is stale...`), with no escaping. `findingLine()` in src/commands/validate.ts:238-241 then prints `finding.message` verbatim via plain template-literal concatenation (`... [${finding.rule}]: ${finding.message}`), with no `singleLine()` or control-character stripping applied anywhere in the render path. An author-controlled `resource` value containing newlines, ANSI escapes, or other control characters therefore reaches the terminal/text output unsanitized, breaking the one-finding-per-line output contract and enabling terminal injection.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A `resource` frontmatter value containing embedded newlines or ANSI escape sequences no longer breaks the single-line-per-finding text output of `validate` — the resulting finding line stays on one line with no raw control bytes.
- [ ] #2 A regression test constructs a concept whose `resource` value contains a newline (or ANSI escape) and asserts the rendered `validate` text/pretty output for that finding is a single sanitized line, e.g. via a test in test/validate.test.ts or test for src/commands/validate.ts's findingLine()/fileLines() output.
<!-- AC:END -->
