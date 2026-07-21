---
id: LORE-153
title: >-
  LinkFinding.message interpolates raw link target unescaped into
  terminal-rendered text
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-links-resolution
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 167000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
validateLink builds LinkFinding.message by interpolating the raw, bundle-authored `target` string verbatim into human-readable text (src/core/links.ts:283, and similarly at lines 293, 308, 314, 320), with no control-character or ANSI/OSC escaping. These messages flow unsanitized to terminal output: check.ts:394-395 copies finding.message verbatim into a portability CheckFinding, and both src/commands/check.ts:926-929 and src/commands/validate.ts:238-240 print finding.message directly to stdout, applying only ANSI color paint to the severity token — never singleLine/stripAnsi sanitization (that helper is only used for error hints, output.ts:205,241). A link destination in a markdown file containing control/ANSI/OSC byte sequences can therefore inject escape sequences into the reviewer's terminal when they run `lore check` or `lore validate`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Link target text is sanitized (e.g. via the existing singleLine/stripAnsi helper in output.ts) before being embedded into LinkFinding.message, or the sanitization is applied at the check.ts/validate.ts print sites (findingLine) before writing finding.message to stdout, so control/ANSI/OSC bytes in a link target can no longer manipulate terminal output.
- [ ] #2 A regression test confirms that a link target containing a raw ANSI escape or control character (e.g. `[31m`) produces a finding message with the escape sequence stripped or neutralized, for at least one of the four LinkFinding issue kinds (missing-extension, directory-link, leading-slash, accidental-colon, unencoded).
<!-- AC:END -->
