---
id: LCLI-135
title: >-
  Anchor-link check lower-cases fragments, masking case-mismatched broken
  anchors
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 149000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
anchorFindings (src/core/check.ts:549) lower-cases the decoded link fragment before comparing it against the target file's heading slugs, which are already lower-case GitHub-style slugs. This means a link like `#My-Section` is accepted as valid even though GitHub and other case-sensitive anchor consumers would treat it as a broken anchor, since the real generated anchor id is `my-section` and the href fragment itself is never case-normalized by browsers. `lore check` therefore fails to flag a real class of rotted/miswritten anchors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A link whose `#fragment` differs only in case from the target heading's actual GitHub-style slug (e.g. `#My-Section` vs. heading slug `my-section`) is reported as a broken-anchor finding by lore check.
- [x] #2 A regression test in test/check.test.ts covers a case-mismatched anchor and asserts a `broken-anchor` finding is produced, alongside an existing exact-case-match test asserting no finding.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. src/core/check.ts anchorFindings(): drop the .toLowerCase() on the decoded fragment so anchor comparison is case-sensitive against the (already lower-case) GitHub-style heading slugs; update the surrounding JSDoc that currently documents the lower-casing as intentional. 2. test/check.test.ts: replace the 'anchor matching is case-insensitive and decode-tolerant' test (which currently asserts a case-mismatched anchor is clean — the bug) with (a) a decode-tolerant exact-case-match test asserting no finding, and (b) a new case-mismatch test asserting a broken-anchor finding per AC#1/AC#2. 3. Run bun test + bun run typecheck, verify green, then finalize.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: src/core/check.ts anchorFindings() no longer .toLowerCase()s the decoded fragment before comparing it to the target file's heading slugs (slugify() already lower-cases slugs at the source, so the compare doesn't need to). Updated the JSDoc above anchorFindings to document the case-sensitive contract and why (GitHub/browsers never normalize the href fragment). test/check.test.ts: replaced the old 'anchor matching is case-insensitive and decode-tolerant' test (which asserted a case-mismatched anchor was clean -- the bug itself) with two tests: a decode-tolerant exact-case-match test (percent-encoded hyphen, same case -> no finding) and a new case-mismatch test asserting a broken-anchor finding. Verified: bun test -> 1772 pass, 0 fail (across 47 files, 5005 expect() calls, includes 199 pass in test/check.test.ts alone); bun run typecheck -> tsc --noEmit clean, no errors. No docs/ files changed, so lore check was not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
anchorFindings() (src/core/check.ts) compared the decoded link fragment case-insensitively (.toLowerCase()) against already-lower-case GitHub-style heading slugs, so a case-mismatched anchor like #My-Section was wrongly accepted against slug my-section. Removed the .toLowerCase() so the compare is case-sensitive, matching real anchor-consumer behavior. Added a regression test in test/check.test.ts asserting a case-mismatched anchor produces a broken-anchor finding, and kept a decode-tolerant exact-case-match test asserting no finding. Verified with bun test (1772 pass, 0 fail across 47 files) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
