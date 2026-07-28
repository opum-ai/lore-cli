---
id: LCLI-155
title: >-
  upsertManagedBlock's update path skips the post-splice validation the insert
  path has
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-07-28 20:15'
labels:
  - codex-review-followup
  - core-managed-template
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: medium
type: bug
ordinal: 169000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
In src/core/managed-block.ts, upsertManagedBlock's update branch (currently lines 368-372) splices the new body between the located markers and returns immediately, with no re-parse of the result. A few lines below, the insert branch (lines 374-386) re-locates the markers in its result and throws a labeledMarkerError if they no longer parse as a clean top-level pair. This asymmetry means the update path has no equivalent fail-loud guard: if splicing a body that itself contains marker-like text (or otherwise disrupts top-level parsing) breaks the block structure, the update path silently returns corrupted content instead of erroring like the insert path does.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The update branch of upsertManagedBlock re-locates the labeled markers in its spliced result (mirroring the insert branch's post-condition check) and throws the same labeledMarkerError-shaped validation error when the result no longer parses as a single clean top-level marker pair.
- [x] #2 A regression test in test/managed-block.test.ts exercises an update where the new body content disrupts top-level marker parsing and asserts upsertManagedBlock throws rather than returning corrupted content.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add post-splice re-validation to upsertManagedBlock's update branch: splice as before, then call locateLabeledMarkers on the result; if it returns null (markers vanished, e.g. swallowed by an unterminated fence introduced by body), throw the same labeledMarkerError the insert branch throws. 2. Update the doc comment's 'Exactly one balanced pair' bullet to describe the new guarantee. 3. Add a regression test in test/managed-block.test.ts: update with a body containing an unclosed code fence, assert upsertManagedBlock throws a validation LoreError (exit 6) naming the label, instead of returning corrupted content. 4. Verify with bun test test/managed-block.test.ts, full bun test, and bun run typecheck.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented post-splice re-validation in upsertManagedBlock's update branch (src/core/managed-block.ts ~378-393): after splicing, call locateLabeledMarkers on the result and throw labeledMarkerError if markers vanish, mirroring the insert branch's post-append guard. Added regression test 'a body that opens an unterminated code fence fails loud instead of returning corrupted content (LCLI-155)' in test/managed-block.test.ts, which reproduces the failure via an unclosed code fence body swallowing the :end marker. Verified: bun test test/managed-block.test.ts -> 45 pass/0 fail; full bun test -> 1810 pass/0 fail across 47 files; bun run typecheck -> clean (tsc --noEmit, no output).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
upsertManagedBlock's update branch now re-locates the labeled markers in its spliced result before returning, throwing the same labeledMarkerError-shaped validation error (exit 6) the insert branch throws when a body disrupts top-level marker parsing (e.g. an unterminated code fence swallowing the :end marker), instead of silently returning corrupted content. Added a regression test in test/managed-block.test.ts exercising exactly that case. Verified with bun test test/managed-block.test.ts (45 pass), full bun test (1810 pass/0 fail, 47 files), and bun run typecheck (clean).
<!-- SECTION:FINAL_SUMMARY:END -->
