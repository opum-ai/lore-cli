---
id: LCLI-151
title: >-
  decodeTarget whole-path decode lets %2F forge a structural slash in link
  targets
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
ordinal: 165000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
decodeTarget (src/core/links.ts:533-538) calls decodeURIComponent over the entire destination string in one pass instead of decoding each path segment independently. Because of this, a literal link target like `orders%2Fv2.md` decodes into `orders/v2.md` before path resolution ever runs, letting a single-segment-looking link text resolve to a two-segment file the author's literal text never named. Both bundle.ts's internalTarget (line 493, which feeds resolvePath at line 465-468 via idFromPath) and check.ts's linkFindings (line 510) rely on this same whole-string decode, so the mismatch between literal link text and resolved target is bundle-wide, not localized to one call site.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A link target containing an encoded path separator, e.g. `orders%2Fv2.md`, is no longer resolved as if it were the two-segment path `orders/v2.md`; percent-decoding is applied per path segment so an encoded `%2F` cannot introduce a new structural `/` boundary.
- [x] #2 Add a regression test (e.g. in the links.ts or bundle.ts test suite) asserting that a link whose literal target is `orders%2Fv2.md` does not resolve to a concept whose id is `orders/v2`.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Fix decodeTarget (src/core/links.ts) to decode per path segment instead of the whole string in one pass: split on literal '/', decodeURIComponent each segment, re-fold any '/' the decode produces back to '%2F' (so an encoded slash can never surface as a bare structural separator), rejoin with '/'. Degrade-to-raw-on-malformed-encoding stays per-segment. 2. Since bundle.ts/check.ts/validate.ts all funnel through this single exported decodeTarget, no other file needs editing. 3. Add regression tests in test/links.test.ts: decodeTarget('orders%2Fv2.md') stays 'orders%2Fv2.md' (not 'orders/v2.md'); idFromPath(decodeTarget('orders%2Fv2.md')) !== 'orders/v2' (AC#2, mirrors bundle.ts's own decode+idFromPath chain); mixed real+encoded slash and lowercase %2f cases; existing decodeTarget tests must still pass unchanged. 4. Verify by reverting to the old implementation and confirming the new tests fail (mutation check), then restoring the fix and running the full suite + typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed decodeTarget (src/core/links.ts) to decode per path segment: split on literal '/', decodeURIComponent each segment independently, then fold any '/' the decode itself produced back to '%2F' before rejoining. This guarantees the output never has more structural '/' boundaries than the raw input had literal ones, so an encoded orders%2Fv2.md can no longer masquerade as the two-segment orders/v2.md. Existing 'decode one level only' / 'malformed degrades to raw' semantics are preserved per-segment. bundle.ts/check.ts/validate.ts all call this single exported decodeTarget, so the fix propagates to all callers without touching those files (out of scope for this task and owned by sibling wave tasks). Verification: bun test test/links.test.ts = 80 pass/0 fail; bun test (full suite) = 1823 pass/0 fail; bun run typecheck = clean. Mutation check: reverted decodeTarget to the original whole-string decodeURIComponent, confirmed all 5 new regression tests fail against it (with the exact old->new value mismatches expected), then restored the fix and re-ran the suite green.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
decodeTarget (src/core/links.ts) now decodes per path segment instead of the whole destination string in one decodeURIComponent pass. It splits on literal '/', decodes each segment independently, and folds any '/' a segment's decode produces back to '%2F' before rejoining — so an encoded separator can never surface as a bare structural '/'. A literal target orders%2Fv2.md now decodes to itself (orders%2Fv2.md), not orders/v2.md, so it can no longer resolve to the concept id orders/v2. Since decodeTarget is the single shared decode used by bundle.ts, check.ts, and validate.ts, the fix propagates to all three callers with no changes to those files. Verified: bun test test/links.test.ts (80 pass/0 fail, including 5 new LCLI-151 regression tests), bun test full suite (1823 pass/0 fail), bun run typecheck (clean). Mutation check: reverting decodeTarget to the pre-fix implementation makes all 5 new tests fail with exactly the forged-slash values, confirming they discriminate; restored the fix afterward.
<!-- SECTION:FINAL_SUMMARY:END -->
