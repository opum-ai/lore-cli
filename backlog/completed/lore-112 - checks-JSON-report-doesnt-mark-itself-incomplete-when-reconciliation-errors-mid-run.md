---
id: LORE-112
title: >-
  check's JSON report doesn't mark itself incomplete when reconciliation errors
  mid-run
status: Done
assignee: []
created_date: '2026-07-21 22:26'
updated_date: '2026-07-22 13:49'
labels:
  - codex-review-followup
  - cmd-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 126000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In runCheck's non-external branch (src/commands/check.ts:186-194), when `driftPromise` resolves with a non-null `error` (a per-root reconciliation failure), the code still calls `emit(reportRenderable(report), ...)` with the findings collected so far, and only rethrows `error` afterward. The emitted report object is identical in both the error and no-error cases, and `CheckReport` (src/core/check.ts:96-118) has no `complete`/status field, so a JSON consumer that reads only stdout (without also checking the process exit code or catching the rejection) cannot distinguish a partial-failure report from a genuinely clean, complete run — even when errorCount is 0.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CheckReport (or its JSON envelope) gains a field, e.g. `complete: boolean`, that is false whenever `driftPromise`'s error is non-null and true otherwise.
- [x] #2 A test drives runCheck with a driftPromise/computeDriftFindings stub that resolves with a non-null error and asserts the emitted report has `complete: false` even when errorCount is 0, distinguishing it from a clean run's `complete: true`.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add CheckReport.complete: boolean to src/core/check.ts (true from summarize(), core's checkBundle is fully sync/never partial). 2. commands/check.ts: set complete:true in checkBundles()'s baseReport construction; in both runCheck driftPromise .then branches (plain and --external+liveness), set complete: error === null on the emitted report so a non-null driftPromise error always downgrades it before emit, even when errorCount stays 0. 3. Add tests in test/check.test.ts: a driftPromise-error case (missing linked task -> not_found, no findings produced) asserting errorCount 0 + complete:false, and a clean fully-reconciled run asserting complete:true. 4. Verify with bun run typecheck + bun test (full suite).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: CheckReport gained a required complete: boolean field (src/core/check.ts). summarize() and commands/check.ts's checkBundles() both set complete:true (nothing async has run yet at those points). runCheck's two driftPromise .then() branches now build the emitted report as { ...mergeFindings(baseReport, findings), complete: error === null } so a non-null driftPromise error always downgrades the emitted JSON report to complete:false before it is emitted and the error is rethrown -- distinguishing a partial-failure run from a clean one even when errorCount is 0 (the failure can short-circuit before any finding is produced). Added two tests: one drives a missing-linked-task rejection (gatherReconciliation throws not_found before producing any finding) and asserts errorCount===0 && complete===false; the other drives a clean fully-reconciled run and asserts complete===true. Verified: bun run typecheck clean (tsc --noEmit, no errors); bun test full suite: 1720 pass, 0 fail, 4844 expect() calls across 45 files (test/check.test.ts alone: 196 pass, 0 fail). bunx biome check on the 3 touched source/test files: clean, no issues.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
CheckReport (src/core/check.ts) gained a required complete: boolean field: true when the whole run finished cleanly, false whenever runCheck's driftPromise resolves with a non-null per-root reconciliation error -- the sole signal in the emitted JSON that distinguishes a partial-failure report from a genuinely clean one, since a short-circuited failure can leave errorCount at 0. Both emitted-report construction points in commands/check.ts (the plain and --external+liveness driftPromise.then branches) now set complete: error === null before emit; the two synchronous CheckReport constructors (core's summarize(), commands/check.ts's checkBundles()) set complete: true, since nothing async has run at those points. Added two tests to test/check.test.ts: a missing-linked-task rejection asserting errorCount 0 + complete false, and a clean fully-reconciled run asserting complete true. Verified with bun run typecheck (clean) and bun test (full suite: 1720 pass / 0 fail / 4844 expect() calls across 45 files; test/check.test.ts: 196 pass / 0 fail).
<!-- SECTION:FINAL_SUMMARY:END -->
