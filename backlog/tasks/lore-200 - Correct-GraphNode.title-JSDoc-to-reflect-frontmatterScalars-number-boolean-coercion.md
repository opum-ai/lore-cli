---
id: LORE-200
title: >-
  Correct GraphNode.title JSDoc to reflect frontmatterScalar's number/boolean
  coercion
status: To Do
assignee: []
created_date: '2026-07-23 16:04'
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
- [ ] #1 The JSDoc on GraphNode.title in src/core/graph.ts no longer states the title is included only "when present and a string"; it states that a finite number or boolean frontmatter title is coerced to its string form (via frontmatterScalar) and that only a missing/empty/whitespace/non-scalar value is omitted.
- [ ] #2 The wording is consistent with buildGraphExport's own JSDoc (which describes an "optional title").
- [ ] #3 No behaviour change; `bun test test/graph.test.ts` stays green, including the existing numeric-title '2024' assertion at test/graph.test.ts:181-185.
<!-- AC:END -->
