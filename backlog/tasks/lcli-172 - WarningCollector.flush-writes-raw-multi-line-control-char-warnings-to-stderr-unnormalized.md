---
id: LCLI-172
title: >-
  WarningCollector.flush writes raw multi-line/control-char warnings to stderr
  unnormalized
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
- [x] #1 A WarningCollector.add() call with a message containing embedded newlines, followed by flush(), writes that warning as a single stderr line (collapsed via singleLine, matching formatErrorText's normalization), verified by a new test in test/errors.test.ts.
- [x] #2 flush()'s per-message write path applies the same singleLine()/asText() normalization used elsewhere in errors.ts before writing to stderr.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In WarningCollector.flush() (src/errors.ts), apply singleLine(asText(message)) to each collected message before writing to stderr, matching formatErrorText/toErrorEnvelope's normalization. 2. Add a test in test/errors.test.ts: add() a message with embedded newlines, flush() with a fake Writer, assert stderr received exactly one write call whose string is the singleLine-collapsed form (single line, no embedded newline). 3. Run bun test (full suite) and bun run typecheck to verify no regressions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: bun test → 1901 pass, 0 fail (5355 expect() calls). bun run typecheck (tsc --noEmit) → clean. bunx biome check src/errors.ts test/errors.test.ts → no issues. Added test 'flush collapses a message with embedded newlines to one stderr line (LCLI-172)' in test/errors.test.ts asserting stderr.lines() === ['warning: first line second line'] for a message 'first line\nsecond line' (AC#1). flush() now writes singleLine(asText(message)) per warning (AC#2).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
WarningCollector.flush() (src/errors.ts) now applies singleLine(asText(message)) to each collected warning before writing it to stderr — the same normalization formatErrorText/toErrorEnvelope apply to a LoreError's message/hint — so a warning with embedded newlines or control characters emits as exactly one stderr line instead of splitting the diagnostic stream. Added a regression test in test/errors.test.ts covering an add() call with embedded newlines followed by flush(). Verified via full bun test (1901 pass / 0 fail) and clean bun run typecheck.
<!-- SECTION:FINAL_SUMMARY:END -->
