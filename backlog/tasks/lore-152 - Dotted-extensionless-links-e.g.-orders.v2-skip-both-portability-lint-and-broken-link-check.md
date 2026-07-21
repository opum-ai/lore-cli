---
id: LORE-152
title: >-
  Dotted extensionless links (e.g. orders.v2) skip both portability lint and
  broken-link check
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
ordinal: 166000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
lacksMarkdownSuffix (src/core/links.ts:352-368) returns false for any link target whose last path segment contains a dot (`last.includes(".")`), so a dotted concept-style link like `orders.v2` (meant to reach `orders.v2.md`) is treated as an opaque asset and never flagged by the portability lint. The function's own doc comment (lines 347-350) claims this is safe because such a broken link "surfaces as a dangling edge" in lore check's link-existence pass instead — but that escape hatch does not exist: bundle.ts's internalTarget (lines 488-494) requires `/\.md$/i.test(path)` and returns null otherwise, so collectBodyEdges never creates an edge for it at all, and check.ts's linkFindings (lines 510-513) independently applies the same `.md`-suffix gate and returns `[]`. As a result, a broken dotted concept link is silently invisible to every lore check/lint mechanism.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A link target with a dotted, extensionless last segment intended as a concept reference (e.g. `orders.v2` where no `orders.v2.md` file exists) is now surfaced as a finding by at least one of: the portability lint (validateLink/lacksMarkdownSuffix) or the broken-link existence check (linkFindings) — the two mechanisms are no longer mutually exclusive gaps for this shape.
- [ ] #2 The links.ts doc comment at lines 347-350 is corrected to no longer claim the broken-link check catches this case, if the fix is made in the portability lint rather than the resolver/existence check.
- [ ] #3 Add a regression test exercising a dotted extensionless link with no matching file and asserting it produces a finding (from whichever mechanism is fixed).
<!-- AC:END -->
