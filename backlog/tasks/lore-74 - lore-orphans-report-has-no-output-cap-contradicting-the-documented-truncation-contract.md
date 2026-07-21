---
id: LORE-74
title: >-
  lore orphans report has no output cap, contradicting the documented truncation
  contract
status: To Do
assignee: []
created_date: '2026-07-21 08:38'
labels:
  - codex-review
  - api-design
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 88000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
docs/reference/cli-contract.md explicitly names orphans as one of the read-heavy commands subject to a bounded-output-with-truncation-hint contract, alongside query/graph/context. computeOrphans/renderReport currently emit every orphaned task and dangling link with no cap and no total/shown/truncated metadata — a regression test (LORE-51) even enshrines rendering all 700,000 rows unbounded. A large Backlog snapshot or bundle can exhaust CI logs or blow an agent context window, exactly what the bounded-output contract exists to prevent.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore orphans caps emitted rows and reports total/shown/truncated counts, consistent with query/graph/context
- [ ] #2 The existing LORE-51 unbounded-output test is updated to reflect the new capped, truncation-hinted behavior
<!-- AC:END -->
