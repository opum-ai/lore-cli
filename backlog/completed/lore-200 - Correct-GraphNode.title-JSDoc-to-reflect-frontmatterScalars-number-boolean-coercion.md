---
id: LORE-200
title: >-
  Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean
  coercion
status: Done
assignee:
  - '@sonnet-worker'
created_date: '2026-07-23 16:04'
updated_date: '2026-07-23 16:27'
labels:
  - core-engine-b
  - codex-review-followup
  - docs
dependencies: []
priority: low
type: docs
ordinal: 302000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
**Outcome:** the `readonly title?: string` field doc on `GraphNode` (src/core/graph.ts, ~line 28) accurately describes when a title is emitted.

**Why:** the comment currently says the title is included "when present and a string; omitted otherwise", but `buildGraphExport` (graph.ts:106) populates it through `frontmatterScalar` (src/core/bundle.ts:633-641), which coerces a **finite number or boolean** to its string form via `String(value)` and only returns `undefined` for a missing / empty-or-whitespace / non-scalar value. test/graph.test.ts:181-185 ("a YAML-coerced non-string title is coerced") already asserts a `title: 2024` node survives as `'2024'`, so the code and the comment disagree.

**Provenance:** Codex second-opinion review (backlog doc-2), low-severity, cluster core-engine-b. Not resolved by the round-1/2 campaign.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The JSDoc on GraphNode.title in src/core/graph.ts no longer states the title is included only "when present and a string"; it states that a finite number or boolean frontmatter title is coerced to its string form (via frontmatterScalar) and that only a missing/empty/whitespace/non-scalar value is omitted.
- [x] #2 The wording is consistent with buildGraphExport's own JSDoc (which describes an "optional title").
- [x] #3 No behaviour change; `bun test test/graph.test.ts` stays green, including the existing numeric-title '2024' assertion at test/graph.test.ts:181-185.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Rewrite the GraphNode.title JSDoc (src/core/graph.ts ~line 28) to say the title is populated via frontmatterScalar, which coerces a finite number or boolean frontmatter title to its string form and only omits it for a missing/empty/whitespace/non-scalar value — matching buildGraphExport's 'optional title' wording. Comment-only change; verify with bun test test/graph.test.ts and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Rewrote GraphNode.title JSDoc (src/core/graph.ts) to describe frontmatterScalar's number/boolean coercion, matching buildGraphExport's 'optional title' wording. Comment-only, no code change. Verified: bun test test/graph.test.ts -> 44 pass, 0 fail (includes the '2024' numeric-title assertion at line 184-185); full bun test -> 1913 pass, 0 fail; bun run typecheck -> clean (tsc --noEmit, no output).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Corrected the GraphNode.title JSDoc in src/core/graph.ts: it previously claimed the title is included 'when present and a string; omitted otherwise', which contradicted buildGraphExport's actual behavior via frontmatterScalar (coerces finite number/boolean to string). Rewrote the doc to state the title is populated via frontmatterScalar, coercing a finite number or boolean to its string form and omitting only missing/empty/whitespace/non-scalar values -- consistent with buildGraphExport's own 'optional title' JSDoc. Comment-only change, no behavior change. Verified with bun test test/graph.test.ts (44 pass/0 fail, including the numeric-title '2024' assertion), full bun test (1913 pass/0 fail), and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
