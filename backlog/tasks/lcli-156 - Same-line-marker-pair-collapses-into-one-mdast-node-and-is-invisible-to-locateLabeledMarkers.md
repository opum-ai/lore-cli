---
id: LCLI-156
title: >-
  Same-line marker pair collapses into one mdast node and is invisible to
  locateLabeledMarkers
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 170000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When a managed block's begin and end markers are placed on a single line with no intervening blank line (e.g. `<!-- lore:agents:begin --><!-- lore:agents:end -->`), mdast's fromMarkdown collapses them into one top-level `html` node whose trimmed value matches neither the begin nor the end regex used by collectMarkerSpans. locateLabeledMarkers (src/core/managed-block.ts:417-444) then sees 0 begins and 0 ends and returns null — the same signal as "no block yet" — so upsertManagedBlock treats a malformed same-line pair as an absent block and appends a brand-new well-formed block after it, leaving the original malformed pair untouched in the file, instead of failing loud on a detected-but-malformed pair.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Calling upsertManagedBlock on content containing a same-line marker pair for the given label (e.g. `<!-- lore:agents:begin --><!-- lore:agents:end -->` with no separating newline) either repairs the pair in place or throws a validation error identifying the malformed same-line markers — it must not silently append a second, duplicate block while leaving the malformed pair in place.
- [x] #2 A regression test in test/managed-block.test.ts reproduces the same-line marker case and asserts the file does not end up with two block instances (one malformed, one freshly appended) after calling upsertManagedBlock.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Confirmed via repro script that mdast collapses a same-line begin+end marker pair into a single top-level html node whose trimmed value matches neither the anchored BEGIN/END regex, so collectMarkerSpans sees 0/0 begins/ends.
2. Extend collectMarkerSpans (src/core/managed-block.ts) to also detect 'malformed' top-level html nodes: ones that don't exactly match the begin/end sentinel but DO contain marker-like text as a substring (via a non-anchored version of the same label-scoped regex) — this catches a same-line begin+end collapse (and similar garbled-marker cases) without any false positives on genuinely marker-free content.
3. In locateLabeledMarkers, check malformed.length>0 BEFORE the 'begins===0 && ends===0 -> null' early return, and throw a labeledMarkerError identifying the malformed same-line markers instead of returning null (which upsertManagedBlock currently reads as 'no block yet' and appends a fresh block, producing a duplicate).
4. Apply the same malformed-detection priority to findMarkers/locateTaskBlock (the lore:tasks-specific callers of the same shared collectMarkerSpans) so the fixed shared primitive behaves consistently everywhere in the file, not just for the labeled-block path.
5. Add regression tests in test/managed-block.test.ts: upsertManagedBlock on a same-line label:begin+label:end pair throws a validation LoreError (exit 6) naming the label, and never yields two block instances (defensive assertion covers a hypothetical future repair-in-place implementation too).
6. Run bun test + bun run typecheck; verify the new test fails against the pre-fix code (mutation check) before finalizing.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause confirmed via mdast repro: parsing '<!-- lore:agents:begin --><!-- lore:agents:end -->' (no separating newline) yields ONE top-level html node with value equal to the full concatenated string, which matches neither the anchored begin nor end sentinel regex. Fix: collectMarkerSpans (shared by findMarkers/locateTaskBlock/locateLabeledMarkers) now also detects 'malformed' top-level html nodes -- ones whose trimmed value contains marker-like text (via a loose, non-anchored version of the same label-scoped pattern) without exactly matching a clean standalone sentinel. locateLabeledMarkers checks malformed.length>0 BEFORE the 'begins===0 && ends===0 -> null' early return and throws a labeledMarkerError instead, so upsertManagedBlock's insert branch is never reached for a same-line pair -- no duplicate block is appended. Same priority applied to findMarkers/locateTaskBlock for the lore:tasks-specific callers of the same shared primitive, for consistency.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed locateLabeledMarkers (and the shared findMarkers/locateTaskBlock) in src/core/managed-block.ts to detect a same-line begin+end marker pair -- which mdast collapses into a single html node matching neither anchored sentinel regex -- as malformed rather than 'no block yet', so it now throws a validation LoreError (exit 6) naming the label instead of letting upsertManagedBlock silently append a duplicate block. Verified with: bun test (1821 pass/0 fail, including 3 new regression tests in test/managed-block.test.ts), bun run typecheck (clean), and a mutation check (git stash of only the source fix) proving the 2 new discriminating tests fail against the pre-fix code and pass once restored. bun run lint confirms the 3 pre-existing useTemplate style warnings are unchanged/pre-existing (present at the same code on the unmodified baseline), not introduced by this change.
<!-- SECTION:FINAL_SUMMARY:END -->
