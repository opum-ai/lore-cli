---
id: LORE-221
title: 'Align id/status columns by terminal display width, not UTF-16 length'
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 18:37'
labels:
  - errors-output-git
  - codex-review-followup
dependencies: []
priority: low
type: enhancement
ordinal: 323000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** The shared id/status column alignment used by `lore tasks` and `lore orphans` pretty output should align correctly when a configured status string contains full-width (CJK) or zero-width/combining characters.

**Why:** `renderTaskSummaryRows` (src/output.ts:413-422) computes column widths with UTF-16 `.length` (`row.id.length`, `row.status.length` at lines 419-420) and pads with `String.prototype.padEnd` (line 421); both count UTF-16 code units, not terminal display columns. A CJK status (one code point, display width 2) under-pads and a combining sequence (two code units, display width 1) over-pads, so the id/status columns visibly misalign. The realistic vector is a wide/combining `status` string — the raw configured Backlog status (src/output.ts:376) — because the `id` column is always ASCII task ids and the `title` is the unpadded last column. This is pretty-mode-only; the --plain/--json machine contracts are unaffected. A repo-wide search confirms the codebase currently has no display-width/wcwidth/east-asian helper, so the fix is net-new but self-contained.

**Provenance:** doc-2 Codex second-opinion review, low-severity finding (cited output.ts:404), errors-output-git cluster. Re-verified still live on `dev`.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Column-width measurement and padding in renderTaskSummaryRows account for terminal display width: full-width East Asian characters count as width 2 and zero-width/combining marks count as width 0.
- [x] #2 Test: rows whose status contains a full-width (CJK) character align so the title column begins at the same offset across rows.
- [x] #3 Test: rows whose status contains a combining mark align correctly.
- [x] #4 ASCII-only rows render byte-identically to today (existing snapshot expectations in test/output.test.ts:517-522 and 528-563 still pass).
- [x] #5 Implemented without adding an external runtime dependency (a compact self-contained width helper is acceptable).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a compact self-contained displayWidth(text) helper in src/output.ts: iterate code points (for...of, handles surrogate pairs), classify each as zero-width/combining (small hand-rolled range table: combining diacritical blocks + variation selectors + ZWSP/ZWNJ/ZWJ/word-joiner/BOM) -> 0, East Asian Wide/Fullwidth (hand-rolled range table: Hangul Jamo, CJK radicals/unified/ext-A, Hiragana/Katakana, Yi, Hangul syllables, CJK compat, fullwidth forms/signs, supplementary CJK planes) -> 2, else -> 1. 2. Add a private padEndDisplay(text, width) that pads by the displayWidth deficit (not padEnd's code-unit deficit). 3. Wire renderTaskSummaryRows to compute idWidth/statusWidth via maxLen(..., displayWidth) and pad via padEndDisplay instead of .length/.padEnd. 4. Export displayWidth alongside maxLen for direct testing. 5. Add tests: a CJK-status two-row case and a combining-mark-status two-row case, both asserting the title column starts at the same offset across rows. 6. Verify existing ASCII snapshot tests (517-522, 528-563, LORE-216 byte-identity test) are untouched and still pass; run bun test + bun run typecheck + bunx biome check on the two pinned files.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added displayWidth(text) in src/output.ts: iterates Unicode code points (for...of, handles surrogate pairs) and classifies each via two compact hand-rolled range tables (isWideCodePoint: East Asian Wide/Fullwidth blocks -> width 2; isZeroWidthCodePoint: combining-mark + zero-width format blocks -> width 0; else width 1). No external runtime dependency (AC#5). Added private padEndDisplay(text, width) that pads by the displayWidth deficit instead of padEnd's code-unit deficit. renderTaskSummaryRows now measures idWidth/statusWidth via maxLen(..., displayWidth) and pads via padEndDisplay (AC#1). Exported displayWidth for direct testing alongside maxLen. Added 6 new tests in test/output.test.ts: two renderTaskSummaryRows alignment tests (CJK-status two-row case, AC#2; combining-mark-status two-row case, AC#3) that assert displayWidth(prefix-before-title) matches across rows AND pin exact byte output, plus 4 direct displayWidth unit tests (ASCII parity, CJK width-2, combining width-0, ZWJ width-0, surrogate-pair non-double-counting).

Verified: bun test -> 1943 pass / 0 fail (full suite, output.test.ts included with 68 tests). bun run typecheck (tsc --noEmit) -> clean. bunx biome check src/output.ts test/output.test.ts -> clean (fixed one formatter wrap + rewrote a non-null-assertion lint warning to optional-chain in the new test helpers). AC#4 confirmed: existing ASCII snapshot tests unchanged byte-for-byte -- 'pads id and status columns to the widest cell, leaves title unpadded' (line ~523), 'returns [] for an empty row list' (~530), and the LORE-216 real-command byte-identity test 'lore tasks and lore orphans render byte-identical rows...' (~534) all still pass verbatim; git diff shows zero changes to those test bodies. git diff --stat confirms only src/output.ts, test/output.test.ts, and this backlog task file changed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
renderTaskSummaryRows (src/output.ts) now measures and pads the id/status columns by terminal display width instead of UTF-16 .length. Added a compact, self-contained displayWidth(text) helper (code-point iteration + two hand-rolled Unicode range tables: East Asian Wide/Fullwidth -> 2 columns, combining-mark/zero-width -> 0 columns, else 1 -- no external wcwidth/string-width dependency) and a private padEndDisplay(text, width) that pads by the display-width deficit. Both idWidth/statusWidth measurement and the row-join padding now route through these, fixing the misalignment a CJK or combining-mark status string previously caused. Added 2 alignment tests (CJK-status row, combining-mark-status row) that assert the title column starts at the same display-column offset across rows and pin exact output bytes, plus 4 direct displayWidth unit tests. ASCII-only behavior is unchanged: displayWidth(ascii) === ascii.length, so the existing byte-identity snapshot tests (widest-cell padding, empty list, and the LORE-216 real-command byte-identity test) pass unmodified. Verified with bun test (1943 pass / 0 fail), bun run typecheck (clean), and bunx biome check on both pinned files (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
