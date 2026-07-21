---
id: LORE-151
title: >-
  decodeTarget whole-path decode lets %2F forge a structural slash in link
  targets
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A link target containing an encoded path separator, e.g. `orders%2Fv2.md`, is no longer resolved as if it were the two-segment path `orders/v2.md`; percent-decoding is applied per path segment so an encoded `%2F` cannot introduce a new structural `/` boundary.
- [ ] #2 Add a regression test (e.g. in the links.ts or bundle.ts test suite) asserting that a link whose literal target is `orders%2Fv2.md` does not resolve to a concept whose id is `orders/v2`.
<!-- AC:END -->
