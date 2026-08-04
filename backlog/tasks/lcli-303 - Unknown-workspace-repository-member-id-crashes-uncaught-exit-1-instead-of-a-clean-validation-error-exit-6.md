---
id: LCLI-303
title: >-
  Unknown --workspace --repository member id crashes uncaught (exit 1) instead
  of a clean validation error (exit 6)
status: Done
assignee:
  - '@codex'
created_date: '2026-08-04 07:26'
updated_date: '2026-08-04 16:58'
labels:
  - workspace
  - error-handling
  - ladybugdb
dependencies: []
references:
  - >-
    Found during the lore-test repo's v0.1.0 comprehensive E2E pass (branch
    e2e/v0.1.0-comprehensive-pass
  - >-
    not merged/pushed): see e2e_findings_v2.md and
    docs/runbooks/e2e-verification-v0.1.0.md in that repo.
modified_files:
  - src/core/workspace-projection.ts
  - src/core/workspace-retrieval.ts
  - test/workspace-retrieval.test.ts
priority: medium
type: bug
ordinal: 416000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
## Outcome
Per `workspace-projection.ts`'s `invalidWorkspace()`, an unknown `--repository <memberId>` under an explicit `--workspace` manifest should fail as a clean validation error, exit 6.

## Observed
Instead, every one of graph/query/context/path/impact crashes uncaught (exit 1, `error_type: uncaught`) with a raw native `@ladybugdb` dlopen failure message when given an unknown `--repository` member id. 100% reproducible across all 5 commands; does not occur for any valid member selection. Almost certainly enabled by LCLI-302 (native LadybugDB backend never activates in the compiled binary), but the validation code path for an unknown member apparently lacks whatever fallback the valid-member paths have, letting an internal native failure escape as an uncaught crash for what should be a cheap, early usage-style validation check.

## Repro
cd into a bundle with a lore-workspace.json, then:

    lore graph --workspace lore-workspace.json --repository bogus-member --json

Expected: exit 6, error_type validation, message names the unknown workspace member.
Actual: exit 1, error_type uncaught, native dlopen failure message (lbugjs.node not found).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Unknown --repository member id under --workspace returns exit 6 / error_type validation, not an uncaught crash, for graph/query/context/path/impact
- [x] #2 Verify the fix holds regardless of whether the native LadybugDB backend is active or falling back (don't couple to LCLI-302)
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Validate the requested workspace member subset immediately after each complete workspace projection load, before native Ladybug reconciliation or driver loading, while preserving the full projection as the indexed cache source.
2. Add command-level regression coverage for graph, query, context, path, and impact that asserts an unknown selected member returns exit 6 / error_type validation and does not expose native-loader details under reference, active indexed, and failed-native automatic fallback paths.
3. Run focused workspace retrieval tests, then the full test suite, typecheck, lint, and diff hygiene; record exact evidence before finalization.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Research at clean dev 8dc88bdddfdd142561eb2e1436264250789a7d48 found selectWorkspaceProjection already produces the correct LoreError("validation"), but loadWorkspaceRetrievalGraph's indexed path calls it only after reconcileLadybugProjection. When native loading fails first, the catch block retries reference loading, discards the reference selection error, and rethrows the earlier native cause, yielding exit 1/uncaught. Pre-validating memberIds inside loadCandidate makes explicit selection fail before any backend-specific work and retains full-workspace indexing semantics for valid subsets.

Implemented backend-independent selection validation via assertWorkspaceProjectionSelection and call it on every full workspace candidate before Ladybug reconciliation. Added CLI regression coverage for graph/query/context/path/impact across reference mode, a proven automatic native-failure fallback, and an active indexed generation. Focused verification passed: bun test test/workspace-retrieval.test.ts (12 tests, 115 expectations).

Final verification on the exact current diff: focused bun test test/workspace-retrieval.test.ts passed 12 tests / 118 expectations; full bun test passed 2,438 tests / 8,236 expectations across 75 files; npm run typecheck passed; npm run lint checked 186 files with no fixes; git diff --check passed. Adversarial self-review confirmed (1) graph/query/context/path/impact each return exit 6 with error_type validation and empty stdout for an unknown selected member, (2) a proven native-loader failure falls back for a valid workspace but is never invoked for the invalid selection, (3) an active indexed generation produces the same validation behavior, and (4) a valid indexed subset reuses the unchanged full-workspace generation. No documentation or configuration update is required. Acceptance is proven, but the task remains In Progress because this restore invocation did not authorize a local commit or remote delivery.

User-authorized local delivery completed in source commit 463a419ba46d4edec480da98640a8107b47e2dc8, containing only src/core/workspace-projection.ts, src/core/workspace-retrieval.ts, and test/workspace-retrieval.test.ts. No push or other remote mutation occurred.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Validated explicit workspace repository selections before native Ladybug reconciliation so unknown members consistently return exit 6 / error_type validation without leaking native-loader failures. Verified all five graph-family commands under reference, failed-native fallback, and active indexed paths; focused 12/12 and full 2,438/2,438 tests, typecheck, lint, and diff hygiene passed. Delivered locally as 463a419ba46d4edec480da98640a8107b47e2dc8.
<!-- SECTION:FINAL_SUMMARY:END -->
