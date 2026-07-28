---
id: LCLI-149
title: 'linkText re-escapes already-escaped brackets, enabling injected markdown links'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-index-context
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 163000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `linkText` (src/core/indexes.ts:194-199), the bracket-escaping step `.replace(/[[\]]/g, (c) => `\\${c}`)` blindly prepends a backslash to every literal `[` or `]` without checking whether a backslash already precedes it. A concept title containing a literal `\]` (an already-escaped bracket) gets a second backslash inserted, which can shift the surrounding text so an attacker-controlled title turns the generated `- [title](link)` entry into a real markdown link to arbitrary content instead of escaped literal text. test/indexes.test.ts's existing bracket-escaping test (lines 74-77) only covers plain brackets ('Plan [B] (draft)') and does not exercise this escape-order edge case, so the bug is untested and unfixed.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A concept title containing a pre-existing backslash-escaped bracket (e.g. 'Plan \\]B\\[ (draft)') round-trips through linkText into safe literal text in the generated index listing, not a broken or injected markdown link.
- [x] #2 A new test case in test/indexes.test.ts covers a title with an already-backslash-escaped '[' or ']' and asserts the rendered link text does not produce an unintended '](' link boundary.
- [x] #3 The existing plain-bracket escaping test (test/indexes.test.ts:74-77) continues to pass unchanged.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In src/core/indexes.ts linkText(): before the existing bracket-escape replace, add a .replace(/\\/g, "\\\\") to double any pre-existing backslash first (same order as the LCLI-154 fix in managed-block.ts cell()). 2. Add a test in test/indexes.test.ts covering a title with an already-escaped bracket (e.g. 'Plan \\]B\\[ (draft)') asserting the rendered text is the doubled-backslash literal form and does not open a real markdown link boundary. 3. Keep the existing plain-bracket test (lines 74-77) passing unchanged. 4. Run bun test test/indexes.test.ts and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed linkText in src/core/indexes.ts: added .replace(/\\/g, "\\\\") to double pre-existing backslashes BEFORE the bracket-escape (same order/class as the LCLI-154 cell() fix in managed-block.ts). Added test 'a pre-existing backslash-escaped bracket is not re-escaped into a live link boundary (LCLI-149)' in test/indexes.test.ts asserting the exact 3-backslash raw output and exactly one real '](' boundary. Verified: bun test test/indexes.test.ts -> 21 pass/0 fail (was 20, now 21, existing plain-bracket test at old lines 74-77 still passes unchanged); full bun test -> 1810 pass/0 fail; bun run typecheck -> clean (tsc --noEmit, no errors).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
linkText() in src/core/indexes.ts now doubles pre-existing backslashes (.replace(/\\/g, "\\\\")) before escaping [ and ], matching the LCLI-154 fix in cell(). A title like 'Plan \\]B\\[ (draft)' now round-trips to safe literal text (exactly one real ']( ' boundary) instead of an injected/broken markdown link. New regression test added in test/indexes.test.ts; existing plain-bracket test (Plan [B] (draft)) still passes unchanged. Verified with bun test test/indexes.test.ts (21 pass), full bun test (1810 pass/0 fail), and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
