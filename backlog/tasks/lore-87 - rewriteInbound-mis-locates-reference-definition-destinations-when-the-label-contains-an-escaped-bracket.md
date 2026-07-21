---
id: LORE-87
title: >-
  rewriteInbound mis-locates reference-definition destinations when the label
  contains an escaped bracket
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - correctness
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 101000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
destRangeForDefinition locates a reference-definition closing label bracket via a plain, non-escape-aware indexOf("]", ...) search. A label containing an escaped bracket (e.g. `[a\]x:y]: ../reference/orders.md`) matches the escaped bracket instead of the real closing one, mis-locating the destination range. Reproduced directly: rewriting an inbound link on such a document corrupts the label and leaves the old destination dangling in the body instead of updating it.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 destRangeForDefinition correctly locates the closing label bracket in the presence of an escaped bracket inside the label
- [ ] #2 A test reproduces the escaped-bracket repro above and asserts the rewrite produces a correct, non-corrupted result
<!-- AC:END -->
