---
id: LORE-164
title: 'Fix rewriteInbound: excluded move source yields rename with no matching write'
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-rewrite-engine
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 178000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
When rewriteInbound is called with move:true and an exclude set that contains the source concept's id, the exclude check at src/core/rewrite.ts:212-214 skips the moved file entirely before it reaches the writes array, while the return statement at line 229 still unconditionally sets plan.rename to { from: fromPath, to: toPath } whenever move is true. This produces a RewritePlan that declares a rename/move but contains no write for the destination path — reproduced directly against current code: calling rewriteInbound(graph, "reference/orders", "reference/sales-orders", { move: true, exclude: new Set(["reference/orders"]) }) returns plan.rename set but plan.writes = []. Callers such as lore rename and lore supersede implicitly rely on a non-null rename being backed by a corresponding write for the new path, so this asymmetry can silently produce a plan that claims a file moved when its content was never written to the destination.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 rewriteInbound(graph, from, to, { move: true, exclude: new Set([from]) }) never returns a plan where `rename` is non-null while `writes` has no entry whose path equals the destination (toPath) — the two stay mutually consistent for any exclude set containing the move source.
- [ ] #2 A regression test exists (e.g. in test/rename.test.ts) that exercises this exact move:true + exclude-contains-source-id combination and asserts the returned plan satisfies the above invariant.
<!-- AC:END -->
