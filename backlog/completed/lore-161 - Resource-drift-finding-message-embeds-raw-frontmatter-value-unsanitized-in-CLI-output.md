---
id: LORE-161
title: >-
  Resource-drift finding message embeds raw frontmatter value unsanitized in CLI
  output
status: Done
assignee:
  - '@claude'
created_date: '2026-07-21 22:26'
updated_date: '2026-07-23 04:10'
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
- [x] #1 A `resource` frontmatter value containing embedded newlines or ANSI escape sequences no longer breaks the single-line-per-finding text output of `validate` — the resulting finding line stays on one line with no raw control bytes.
- [x] #2 A regression test constructs a concept whose `resource` value contains a newline (or ANSI escape) and asserts the rendered `validate` text/pretty output for that finding is a single sanitized line, e.g. via a test in test/validate.test.ts or test for src/commands/validate.ts's findingLine()/fileLines() output.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Locate the unsanitized interpolation in resourceDriftFindings() (src/core/validate.ts): the raw frontmatter 'resource' string (actual) is embedded verbatim into finding.message with no singleLine()/control-stripping.
2. Fix at the construction site (core/validate.ts), not the print site (commands/validate.ts) or output.ts: add a local sanitizeForMessage() helper that runs the exported singleLine() (from ../errors) to collapse line terminators, then strips ANSI escape sequences + residual C0/C1/DEL control bytes (same two-pass shape as output.ts's private stripAnsiAndControls, LORE-115, reimplemented locally since core/validate.ts must not import from the command-layer output.ts). Apply it ONLY when building the message string -- the raw 'actual' is still used unsanitized for the equality/decodeTarget drift comparisons so detection logic is unaffected.
3. Add regression tests in test/validate.test.ts: (a) a core-level test in the existing 'resource drift' describe block asserting finding.message for a resource value with an embedded newline + ANSI escape (via a YAML double-quoted scalar's \n/\x1b escapes) is free of raw control bytes and still legible; (b) a command-layer test in 'validate (command) -- rendering' that writes a resource_base-bearing profile + a concept with the same malicious resource value and asserts runValidate's plain-mode text output stays exactly one finding line with no control bytes.
4. Mutation-check: git diff -- src/core/validate.ts > patch; git apply -R patch to revert only the fix (keep tests); confirm both new tests FAIL; git apply patch to restore; confirm both PASS.
5. Run full bun test + bun run typecheck, both green. Check off AC1/AC2. Finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed in src/core/validate.ts: resourceDriftFindings() now sanitizes the author-controlled resource frontmatter value (singleLine + ANSI/control-byte strip, new local sanitizeForMessage()) before embedding it in finding.message, applied only at message construction so drift-comparison logic is untouched. src/commands/validate.ts and src/output.ts left untouched (shared contract). Verification: 2 new regression tests added to test/validate.test.ts (core + command-layer plain-mode rendering); mutation-checked via git diff/apply -R (no stash) -- both fail pre-fix, pass post-fix. bun test: 1874 pass/0 fail across 47 files. bun run typecheck: clean.
<!-- SECTION:NOTES:END -->
