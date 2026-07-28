---
id: LCLI-165
title: Add regression test for rewriteInbound's move + excluded-source-id combination
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-rewrite-engine
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 179000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
test/rename.test.ts previously lacked coverage for three scenarios: escaped-bracket reference labels, an id that escapes the bundle root, and a move combined with an excluded source id. The first two are now covered (lines 95-105 and 372-482 respectively), but the existing exclude test block (lines 336-349) only exercises move:false, so the exact move:true + exclude-contains-source-id scenario — the same combination behind the open rewrite.ts:197/225-229 finding — remains untested. Without this coverage, a regression in how exclude interacts with move (e.g. plan.rename set with no corresponding write) would not be caught by the test suite.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 test/rename.test.ts contains a test that calls rewriteInbound with move:true and exclude:new Set([<source id>]), and asserts on the shape of the returned plan's `rename` and `writes` fields together (not merely that the excluded id's file is skipped).
- [x] #2 The new test is written so it fails against the current, unfixed rewriteInbound behavior (rename set with no matching write for the destination path) and passes once that inconsistency is corrected.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Resolved-by-merge by LCLI-164 (merged to dev, PR #159). LCLI-164 added exactly the required regression test at test/rename.test.ts:355 — "move=true with the move source itself excluded reports no rename (LCLI-164)" — which calls rewriteInbound(graph(), "reference/orders", "reference/sales-orders", {move:true, exclude:new Set(["reference/orders"])}) and asserts on BOTH plan.rename (toBeNull) AND plan.writes (toEqual []) together, satisfying AC#1's requirement to assert on the rename+writes shape jointly (not merely that the excluded id is skipped). AC#2: LCLI-164's documented mutation-check confirmed the test fails against the unfixed rewriteInbound (rename={from,to} while writes=[]) and passes after the fix — exactly the fail-before/pass-after property AC#2 requires. Verified on dev @ 04deae2: grep + read of test/rename.test.ts:355-365 confirms the test is present in the merged suite. No separate implementation needed.
<!-- SECTION:NOTES:END -->
