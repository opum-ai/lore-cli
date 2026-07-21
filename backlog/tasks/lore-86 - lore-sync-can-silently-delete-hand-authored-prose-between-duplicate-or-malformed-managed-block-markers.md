---
id: LORE-86
title: >-
  lore sync can silently delete hand-authored prose between duplicate or
  malformed managed-block markers
status: Done
assignee:
  - '@jeremy'
created_date: '2026-07-21 08:38'
updated_date: '2026-07-21 09:19'
labels:
  - codex-review
  - error-handling
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
priority: high
type: bug
ordinal: 100000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
locateManagedBlock recovers from a malformed marker layout (two begin/end pairs, or an unmatched begin) by taking the first begin to the last end, silently collapsing and deleting any hand-written prose sitting in between instead of failing loudly. This is reachable via a merge conflict or hand edit leaving index.md with duplicate lore:index markers; the next lore sync permanently deletes the prose between them with no warning.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 locateManagedBlock detects a malformed marker layout (duplicate begin/end pairs, or an unmatched begin) and fails with a clear error instead of silently collapsing content
- [x] #2 A test covers the duplicate-marker-pair scenario (with real prose between the pairs) and asserts the prose is preserved or the operation is refused with a clear error, not silently deleted
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Root cause confirmed in src/core/indexes.ts:285 locateManagedBlock: a plain indexOf/lastIndexOf scan that (a) collapses a duplicated marker pair to its first-begin->last-end span, silently deleting any hand-authored prose sitting between the two blocks, and (b) extends an unmatched begin (no end marker) to end-of-file, silently absorbing whatever followed. Both are documented as deliberate design choices for fixpoint convergence, but (a) is exactly LORE-86's reported bug.
2. A sibling module (src/core/managed-block.ts, LORE-22/36's mdast-based engine for the lore:tasks block) already solved this correctly: it validates marker counts (missing/duplicated/crossed) and throws a LoreError('validation', ...) instead of guessing, via findMarkers()/locateLabeledMarkers(). Mirror that same fail-loud contract in locateManagedBlock, reusing its error shape/wording style, rather than inventing a new one.
3. Rewrite locateManagedBlock to: return null when there are zero begin markers (unchanged - unmanaged file, caller appends); throw when begins>1 or ends>1 (duplicated pair); throw when a single begin has zero ends after it, or the only end precedes the begin (unmatched/crossed). Keep the well-formed single-pair case's return value byte-identical to today.
4. This function is shared by 3 call sites (indexes.ts's own generateIndexes/render, replace.ts's managedRanges, rename.ts's spliceEmptyListing) - trace each to confirm a thrown LoreError propagates cleanly to the command layer's existing try/catch -> reportError seam with no swallowing, and that no partial write can occur (sync.ts's writes only happen after generateIndexes returns; replace.ts's Phase 1 reads+rewrites everything before Phase 2 writes anything).
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Fix: rewrote locateManagedBlock (src/core/indexes.ts) to fail loud instead of guessing. New contract: 0 begins -> null (unmanaged file, unchanged); >1 begins or >1 ends -> LoreError('validation', ...) naming 'duplicated' with the exact counts; exactly 1 begin with 0 ends, or the only end preceding the begin -> LoreError naming 'unmatched'/'crossed'. The well-formed single-pair case is byte-identical to before. Mirrors managed-block.ts's existing findMarkers() fail-loud pattern (same error category/wording style) so the two managed-block engines (lore:index string-splice, lore:tasks mdast) refuse to guess in the same voice.

Updated 4 existing tests whose assertions pinned the OLD silent-collapse/truncate-to-EOF behavior as a feature (test/indexes.test.ts's 'a truncated block...' and 'duplicate well-formed blocks...collapse into one', test/replace.test.ts's 'a begin with no matching end owns the rest of the file' and 'the span between two blocks is protected... (review #3)') to instead assert LoreError is thrown. Added a new dedicated test/indexes.test.ts case directly exercising locateManagedBlock's full contract (no-markers/well-formed/truncated/duplicated/crossed). AC2's exact scenario (duplicate marker pair WITH real hand-authored prose between them) is covered by 'duplicate marker pairs with real prose between them is a validation error, not a silent collapse-and-delete (LORE-86)' in indexes.test.ts.

Traced all 3 call sites (indexes.ts's generateIndexes/render, replace.ts's managedRanges/applyReplacement, rename.ts's spliceEmptyListing) to confirm no swallowing: none wrap the call in try/catch, so a thrown LoreError propagates cleanly to each command's existing try/catch -> reportError seam (same mechanism replace.ts's compileReplacer usage errors and managed-block.ts's validation errors already use). Confirmed no partial-write risk: sync.ts's writes only happen after generateIndexes fully returns; replace.ts's Phase 1 reads+rewrites every target before Phase 2 writes anything.

End-to-end verification with the real CLI (not just unit tests): built a scratch bundle with docs/index.md carrying two <!-- lore:index:begin/end --> pairs and real hand-authored prose between them, ran 'lore sync --json' -> exit 6, error_type=validation, message names the exact duplicate count (2 begin, 2 end), hint tells the user exactly what to fix; verified the file was left completely byte-identical afterward (no partial write, prose fully preserved on disk since nothing was written at all). Full bun test: 1506 pass/0 fail (up from 1505). bun run typecheck clean. Lint clean on changed files (src/core/indexes.ts, test/indexes.test.ts, test/replace.test.ts).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rewrote locateManagedBlock (src/core/indexes.ts, shared by index regeneration/lore replace/lore rename) to fail loud on a malformed managed-block layout instead of silently guessing: a duplicated marker pair or an unmatched/crossed begin now throws a LoreError('validation', exit 6) naming exactly what's wrong, mirroring managed-block.ts's existing fail-loud pattern for the sibling lore:tasks block. Previously a duplicated pair collapsed to its first-begin->last-end span, silently deleting any hand-authored prose sitting between the two blocks (the exact LORE-86 repro: a merge conflict/hand edit leaving duplicate lore:index markers). Verified end-to-end with the real CLI: a scratch bundle with duplicate markers and real prose between them now fails lore sync with a clear exit-6 error and the file is left completely untouched (prose fully preserved, since nothing gets written on the error path) -- previously it would have silently deleted the prose with exit 0. Updated 4 tests that pinned the old silent-collapse behavior as a feature, and added a dedicated locateManagedBlock contract test. bun test 1506/1506 pass (up from 1505), typecheck clean, lint clean.
<!-- SECTION:FINAL_SUMMARY:END -->
