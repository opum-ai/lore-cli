---
id: LORE-248
title: >-
  warnSummary counts UTF-16 code units but reports "chars" — non-BMP summaries
  warn prematurely
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
labels:
  - core-scaffold-consumer
  - codex-review-followup
dependencies: []
priority: low
type: bug
ordinal: 350000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The `summary` soft-length advisory in `warnSummary` should measure the summary in Unicode code points, so the count matches the "chars" it reports and ADR-0006 §5's "~200 characters" intent, instead of over-counting non-BMP characters.

**Why:** In `src/core/schema.ts` (`warnSummary`, lines 267-268; `const SUMMARY_SOFT_LIMIT = 200` at line 90) the check is `summary.length > SUMMARY_SOFT_LIMIT` and the emitted warning is `` `summary`${where} is ${summary.length} chars; keep it under ~${SUMMARY_SOFT_LIMIT} (one sentence)``. `String.prototype.length` returns UTF-16 code units, so every non-BMP character (emoji such as U+1F600, many CJK-extension/supplementary characters) is a surrogate pair counted as 2. A summary of ~150 visible emoji (300 code units) crosses the 200 soft limit and is reported as "300 chars" even though it is ~150 visible characters — the advisory fires prematurely and its "chars" label is inaccurate.

**Live context:** `src/core/schema.ts:267-268` (the only summary-length check in `src/`; the chars/4 estimates in `context.ts`/`bundle.ts` are an unrelated token heuristic). Minimal fix: count code points via `[...summary].length` (or `Array.from(summary).length`) in both the comparison and the interpolated message; keep the "chars" wording, which is then accurate. `Intl.Segmenter` grapheme counting is an acceptable but not-required refinement (ZWJ/flag/combining-mark clusters) — not needed to close this finding.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity finding, cluster core-scaffold-consumer; round-3 re-audit confirmed the defect is still present on `dev`.

**No regressions:** Existing tests `test/schema.test.ts:235-239` and `test/profile.test.ts:639-654` use 250 ASCII characters (code points == code units == 250) and must continue to pass unchanged.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `warnSummary` in src/core/schema.ts measures the summary by Unicode code points (e.g. `[...summary].length`), not UTF-16 code units, in both the `> SUMMARY_SOFT_LIMIT` comparison and the interpolated count in the warning message.
- [ ] #2 A new test asserts that a summary of 150 non-BMP emoji (e.g. "😀".repeat(150) = 300 UTF-16 code units, 150 code points) does NOT trigger the over-long `summary` warning.
- [ ] #3 A new (or extended) test asserts that a summary of 250 non-BMP emoji (250 code points) DOES warn and reports "250 chars", proving the count is code-point based.
- [ ] #4 Existing tests test/schema.test.ts:235-239 and test/profile.test.ts:639-654 (250 ASCII 'x' warns "250 chars") still pass unchanged.
- [ ] #5 `bun test` passes.
<!-- AC:END -->
