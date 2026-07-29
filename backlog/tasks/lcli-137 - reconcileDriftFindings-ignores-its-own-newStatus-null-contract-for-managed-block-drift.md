---
id: LCLI-137
title: >-
  reconcileDriftFindings ignores its own newStatus:null contract for
  managed-block drift
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:26'
labels:
  - codex-review-followup
  - core-bundle-check
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 151000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
ReconcileDriftInput.newStatus's docstring (src/core/check.ts:412-413) states null means the concept has no linked tasks and should 'never drift either way.' But reconcileDriftFindings (check.ts:446-479) only gates the status-drift check on `newStatus !== null` (line 449); the managed-block regeneration and drift comparison at line 468 (`regenerateTaskBlock(...)`) runs unconditionally regardless of newStatus. So a concept with no linked tasks (newStatus === null) can still produce a managed-block-drift finding, contradicting the documented 'never drift either way' contract for that input.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 reconcileDriftFindings returns no findings (neither status-drift nor managed-block-drift) when called with input.newStatus === null, matching the documented contract.
- [x] #2 A regression test in test/check.test.ts calls reconcileDriftFindings with newStatus: null and rows/original data that would otherwise trigger a managed-block-drift finding, and asserts the returned findings array is empty.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Guard reconcileDriftFindings with an early return when input.newStatus === null, skipping BOTH the status-drift and managed-block-drift checks (previously only status-drift was gated on newStatus !== null; managed-block regeneration ran unconditionally). Add a direct unit test in test/check.test.ts that calls reconcileDriftFindings with newStatus: null plus a stale managed block and a disagreeing currentStatus, asserting an empty findings array.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fixed reconcileDriftFindings (src/core/check.ts) to early-return [] when input.newStatus === null, before either the status-drift or managed-block-drift check runs -- matching the documented 'never drift either way' contract on ReconcileDriftInput.newStatus. Previously only the status-drift check was gated on newStatus !== null; regenerateTaskBlock ran unconditionally, so a no-linked-tasks concept could still surface a managed-block-drift finding. Added a direct unit test in test/check.test.ts ('reconcileDriftFindings — newStatus: null never drifts either way (LCLI-137 regression)') calling reconcileDriftFindings with newStatus: null, a stale managed block, and a disagreeing currentStatus, asserting findings is []. Confirmed the test fails (reproduces the bug) against the pre-fix code via git stash, and passes with the fix.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
reconcileDriftFindings now returns [] immediately when input.newStatus === null, skipping both the status-drift and managed-block-drift checks (previously the managed-block regeneration/compare ran unconditionally). Verified: bun test test/check.test.ts -> 203 pass/0 fail (new regression test included); bun test (full suite) -> 1810 pass/0 fail; bun run typecheck -> clean (tsc --noEmit, no output). Also confirmed via git stash that the new test fails against the pre-fix code (produces a spurious managed-block-drift finding) and passes with the fix.
<!-- SECTION:FINAL_SUMMARY:END -->
