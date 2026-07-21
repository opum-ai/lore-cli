---
id: LORE-148
title: context export tokenEstimate ignores title field and JSON overhead
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
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
ordinal: 162000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In `neighborOf` (src/core/context.ts:206-216), each neighbor's `tokenEstimate` is computed from `estimateTokens(`${id} ${concept.type} ${summary ?? ""}`)`, which omits the neighbor's `title` field (spread onto the object at line 212 whenever present) and any JSON serialization overhead. Because `buildContext` sums these per-neighbor estimates against `--max-tokens` to decide what to include, a bundle full of concepts with long titles but short/absent summaries produces an emitted payload whose real size can exceed `--max-tokens` by a wide, uncontrolled margin. This breaks the documented contract that `--max-tokens` bounds the emitted context pack size (docstring at lines 85-86 and 101-114 describes `tokenEstimate` as the pack's cost accounting).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 neighborOf's tokenEstimate calculation includes the neighbor's title (when present) in the string it estimates from, not just id/type/summary.
- [ ] #2 A regression test in test/context.test.ts asserts that for a neighbor with a long title and a short/absent summary, the neighbor's tokenEstimate reflects the title's contribution (e.g. differs from an otherwise-identical neighbor with no title).
- [ ] #3 The docstring for ContextNeighbor.tokenEstimate (context.ts:85-86) and neighborOf (context.ts:200-205) is updated to match the corrected cost model.
<!-- AC:END -->
