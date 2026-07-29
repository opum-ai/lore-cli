---
id: LCLI-164
title: 'Fix rewriteInbound: excluded move source yields rename with no matching write'
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:27'
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
- [x] #1 rewriteInbound(graph, from, to, { move: true, exclude: new Set([from]) }) never returns a plan where `rename` is non-null while `writes` has no entry whose path equals the destination (toPath) — the two stay mutually consistent for any exclude set containing the move source.
- [x] #2 A regression test exists (e.g. in test/rename.test.ts) that exercises this exact move:true + exclude-contains-source-id combination and asserts the returned plan satisfies the above invariant.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. In rewriteInbound (src/core/rewrite.ts), make the returned rename mutually consistent with writes: rename = move && !exclude.has(from) ? {from: fromPath, to: toPath} : null (previously rename was set unconditionally whenever move was true, even when the loop had skipped past the excluded move source without pushing its destination write). 2. Add a regression test in test/rename.test.ts exercising rewriteInbound(graph, from, to, {move:true, exclude:new Set([from])}) asserting plan.rename is null and plan.writes is empty. 3. Mutation-check: confirm the new test fails against the pre-fix code and passes after the fix. 4. Run full bun test + bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: rewriteInbound (src/core/rewrite.ts) now computes rename = move && !exclude.has(from) ? {from: fromPath, to: toPath} : null, instead of unconditionally setting rename whenever move is true. When move:true and exclude contains the source id, the affected-files loop already skips the source before pushing its destination write, so rename now stays null in that case, keeping rename and writes mutually consistent. Also updated the exclude option doc comment to state this behavior. Regression test added: test/rename.test.ts "move=true with the move source itself excluded reports no rename (LCLI-164)" — calls rewriteInbound(graph(), "reference/orders", "reference/sales-orders", {move:true, exclude:new Set(["reference/orders"])}) and asserts plan.rename is null and plan.writes is []. Mutation-check performed via git stash: with the fix reverted, the new test fails (received rename={from:"reference/orders.md", to:"reference/sales-orders.md"} instead of null); with the fix restored, it passes. Full verification: bun test test/rename.test.ts -> 99 pass/0 fail; bun test (full suite) -> 1846 pass/0 fail across 47 files; bun run typecheck -> clean (tsc --noEmit, no output).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed rewriteInbound (src/core/rewrite.ts): rename is now computed as move && !exclude.has(from) ? {from,to} : null, so an exclude set containing the move source no longer yields a plan with rename set but no matching destination write. Added regression test in test/rename.test.ts covering the exact move:true + exclude-contains-source combo, asserting rename is null and writes is empty. Verified: mutation-check (test fails with fix reverted via git stash, passes restored), full bun test suite 1846 pass/0 fail, bun run typecheck clean.
<!-- SECTION:FINAL_SUMMARY:END -->
