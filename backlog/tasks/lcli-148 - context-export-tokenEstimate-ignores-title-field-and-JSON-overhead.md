---
id: LCLI-148
title: context export tokenEstimate ignores title field and JSON overhead
status: Done
assignee: []
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
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
- [x] #1 neighborOf's tokenEstimate calculation includes the neighbor's title (when present) in the string it estimates from, not just id/type/summary.
- [x] #2 A regression test in test/context.test.ts asserts that for a neighbor with a long title and a short/absent summary, the neighbor's tokenEstimate reflects the title's contribution (e.g. differs from an otherwise-identical neighbor with no title).
- [x] #3 The docstring for ContextNeighbor.tokenEstimate (context.ts:85-86) and neighborOf (context.ts:200-205) is updated to match the corrected cost model.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In neighborOf (src/core/context.ts), include the neighbor's title (when present) as its own segment in the tokenEstimate input string, alongside id/type/summary, rather than only id/type/summary. 2. Charge title independently of summary even when summary is the title-fallback (both fields are actually emitted under --json), so the estimate is conservative (never undercounts) rather than exactly matching the plain-text renderer (which is a subset). 3. Update the ContextNeighbor.tokenEstimate and neighborOf docstrings (and the module header's neighbor-cost paragraph) to describe the corrected id+type+title+summary cost model. 4. Update the two existing tests whose literal expected strings encoded the old (title-omitting) formula, and add a new regression test with a long-titled/short-summary neighbor asserting its tokenEstimate reflects the title's contribution vs an otherwise-identical titleless neighbor. 5. Run bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed neighborOf in src/core/context.ts: tokenEstimate now charges id+type+title(when present)+summary(when present), instead of id+type+summary only. title is charged independently even when summary is the title-fallback (both fields are actually emitted under --json), which is conservative (over-count, never under-count) matching the module's stated design philosophy. Updated the ContextNeighbor.tokenEstimate docstring, neighborOf's docstring, and the module header's neighbor-cost paragraph to describe the corrected cost model. Updated two existing tests in test/context.test.ts whose literal expected strings encoded the old title-omitting formula, and added a new regression test (long title + short summary neighbor vs an otherwise-identical titleless neighbor) proving the title's contribution is now counted. Verification: bun test -> 1795 pass, 0 fail (full suite, includes 40 tests in test/context.test.ts); bun run typecheck -> clean (tsc --noEmit, no output/errors). No docs/ files changed so lore check was not required.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
neighborOf's tokenEstimate now includes the neighbor's title (when present) alongside id/type/summary, so a long-titled/short-summarized neighbor's real byte cost is counted instead of silently undercounted against --max-tokens. Docstrings for ContextNeighbor.tokenEstimate, neighborOf, and the module header's cost-model paragraph updated to match. Verified: bun test (1795 pass/0 fail) and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
