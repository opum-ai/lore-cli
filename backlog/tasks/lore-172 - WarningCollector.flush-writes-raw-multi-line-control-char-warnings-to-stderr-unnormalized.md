---
id: LORE-172
title: >-
  WarningCollector.flush writes raw multi-line/control-char warnings to stderr
  unnormalized
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - errors-output-git
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 186000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
WarningCollector.flush() (src/errors.ts:592-601) writes each collected warning verbatim via `stderr.write(`${prefix} ${message}\n`)` with no `singleLine()`/control-character stripping, unlike other diagnostic surfaces in the same file (formatErrorText/toErrorEnvelope both call `singleLine(asText(...))` on message/hint). Since `add()` (lines 556-561) stores whatever message string a caller passes with no normalization either, a warning containing embedded newlines or control characters is emitted across multiple stderr lines or with raw control bytes, breaking the one-warning-per-line stderr contract other diagnostics rely on.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A WarningCollector.add() call with a message containing embedded newlines, followed by flush(), writes that warning as a single stderr line (collapsed via singleLine, matching formatErrorText's normalization), verified by a new test in test/errors.test.ts.
- [ ] #2 flush()'s per-message write path applies the same singleLine()/asText() normalization used elsewhere in errors.ts before writing to stderr.
<!-- AC:END -->
