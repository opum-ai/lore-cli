---
id: LCLI-226
title: Sanitize control characters in check's finding output
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:16'
labels:
  - cmd-check
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 328000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`lore check` emits untrusted, author-controlled content to the terminal without control-character escaping, so a crafted markdown link target/filename can inject ANSI escape sequences or newlines into `check`'s plain and pretty stdout.

**Live context.** `findingLine` (`src/commands/check.ts:966-969`) interpolates `finding.file` and `finding.message` raw. Those messages embed the raw untrusted link destination: `src/core/check.ts:549` (broken-link) and `src/core/check.ts:585` (broken-anchor) interpolate `${target}`/`${fragment}` verbatim. An embedded newline additionally forges a phantom finding row (`renderReport` joins lines with `\n`, `src/commands/check.ts:956-963`).

**Why.** This is the same terminal/log-injection class already fixed in every sibling surface — `output.ts` renderTaskSummaryRows (LCLI-115), `commands/query.ts` (LCLI-118), `core/validate.ts` (LCLI-161), `core/links.ts` (LCLI-153) — all via the shared `stripAnsiAndControls` at `src/errors.ts:168-176`. `check` is the remaining un-sanitized command on this class of finding.

**Provenance.** doc-2 Codex second-opinion review, Low-severity cluster `cmd-check`, finding [2]. Verified still-open against `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A broken-link/broken-anchor finding whose link target or filename contains an ESC/CSI sequence or a newline renders with those control characters stripped in both plain and pretty modes (no raw ESC bytes, no phantom finding lines).
- [x] #2 The fix reuses the shared `stripAnsiAndControls` helper (src/errors.ts) rather than a new copy of the regexes.
- [x] #3 Ordinary finding output (paths, rules, messages without control characters) is unchanged.
- [x] #4 Existing check tests continue to pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Import stripAnsiAndControls from ../errors in src/commands/check.ts. 2. In findingLine (~line 984), sanitize finding.file and finding.message via stripAnsiAndControls before interpolation, so ESC/CSI/newlines from untrusted link targets can't inject terminal escapes or forge phantom finding rows in plain or pretty mode. 3. Add a test in test/check.test.ts: a broken-link/broken-anchor finding whose target contains ESC+newline renders sanitized in both plain and pretty modes; assert no raw ESC byte and no extra line count from an injected newline. 4. Confirm ordinary findings unchanged (existing tests). 5. Run bun test + bun run typecheck + biome check on changed files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: findingLine (src/commands/check.ts) now sanitizes finding.file and finding.message via the shared stripAnsiAndControls (../errors) before interpolation. Verified via new tests in test/check.test.ts: (1) an OSC set-title payload (\x1b]0;INJECTED\x07) smuggled into a broken-link target via CommonMark angle-bracket link-destination syntax is fully stripped in both plain and pretty stdout (no 'INJECTED', no raw OSC introducer); (2) a raw ESC+CSI byte via the same angle-bracket vector never reaches plain-mode stdout at all; (3) a newline smuggled via a numeric char-reference (&#10;, which CommonMark decodes to a literal LF inside a bare link destination) no longer forges a phantom finding row — asserted via exact line count (3: broken-link + portability + summary) in both plain and pretty modes; (4) an ordinary control-char-free finding renders its exact prior text unchanged. Full bun test: 1940 pass / 0 fail (was 214/0 for check.test.ts alone). bun run typecheck: clean. bunx biome check on both changed files: clean, no new findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
findingLine in src/commands/check.ts sanitizes finding.file and finding.message via the shared stripAnsiAndControls (src/errors.ts) before interpolation, closing check's remaining terminal/log-injection gap: an ESC/CSI or OSC sequence, or a newline, smuggled into a link target (via CommonMark's angle-bracket link-destination syntax or a numeric character reference) is now stripped from both plain and pretty stdout, with no phantom finding rows. Ordinary control-char-free findings render unchanged. New tests added to test/check.test.ts covering all four ACs; full bun test 1940/0, typecheck clean, biome clean on changed files.
<!-- SECTION:FINAL_SUMMARY:END -->
