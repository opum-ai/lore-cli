---
id: LORE-135
title: >-
  Anchor-link check lower-cases fragments, masking case-mismatched broken
  anchors
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
- [ ] #1 A link whose `#fragment` differs only in case from the target heading's actual GitHub-style slug (e.g. `#My-Section` vs. heading slug `my-section`) is reported as a broken-anchor finding by lore check.
- [ ] #2 A regression test in test/check.test.ts covers a case-mismatched anchor and asserts a `broken-anchor` finding is produced, alongside an existing exact-case-match test asserting no finding.
<!-- AC:END -->
