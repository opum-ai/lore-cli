---
id: LCLI-150
title: generateIndexes never detects or removes an orphaned sub-index directory
status: Done
assignee:
  - '@claude'
created_date: '2026-07-28 20:14'
updated_date: '2026-08-03 16:11'
labels:
  - codex-review-followup
  - core-index-context
  - 'doc:stories/harden-lore-cli-correctness-and-safety'
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
documentation:
  - docs/stories/harden-lore-cli-correctness-and-safety.md
priority: medium
type: bug
ordinal: 164000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
`generateIndexes` (src/core/indexes.ts:103-154) derives `indexDirs` solely from `conceptsByDir.keys()` plus their ancestors (line 122-129), and its returned map (line 146-153) contains only those live directories. It never compares against `options.existing`'s keys to find a directory whose `index.md` is on disk but that no longer holds any concept (e.g. after a manual `rm`/`mv` outside `lore rename`). The caller, `regenerateIndexAndLog` in src/commands/sync.ts (lines 207-219), only iterates `regeneratedIndexes` (the live set) and never inspects `diskIndexBytes` for stale keys absent from that set, so `lore sync` silently leaves the orphaned `index.md` on disk, unflagged and unmentioned in the sync report.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Given a docs bundle where a directory's on-disk index.md exists in `options.existing` but the directory has no concepts (directly or via descendants) in the current graph, `lore sync` either removes/flags that stale index.md or reports it as an orphaned/stale index in its output — it is no longer silently left untouched.
- [x] #2 A new test in test/indexes.test.ts (or test/sync.test.ts) exercises this scenario: seed `existing` with an index.md for a directory absent from the current graph's concepts, run generateIndexes/sync, and assert the orphaned index is detected (removed from the result map, or surfaced as a distinct reported change) rather than passed through silently.
- [x] #3 Existing directories that still hold live concepts continue to regenerate exactly as before (no regression to the fixpoint/AC#1 behavior documented at indexes.ts:99-101).
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. indexes.ts: extract the live-index-directory computation (root + every dir holding a concept, directly or via ancestors) into a shared private helper 'liveIndexDirs(g)', used by generateIndexes unchanged (no behavior change, satisfies AC#3). 2. indexes.ts: add a new exported pure function 'orphanedIndexPaths(g, existing)' that returns the sorted bundle-relative paths present in 'existing' but whose directory is NOT in liveIndexDirs(g) -- i.e. an on-disk index.md for a directory with no concepts, directly or via descendants (LCLI-150). generateIndexes's own return value/signature stays untouched so rename.ts (out of scope) keeps compiling and behaving identically. 3. sync.ts: in regenerateIndexAndLog, call orphanedIndexPaths(graph, diskIndexBytes) and return the list; runSync threads it into a new SyncReport.orphanedIndexes field (DOCS_DIR-prefixed paths), reported via a distinct 'orphaned index ...' line in render() -- files are NOT deleted (safer, matches AC#1's 'or reports it' branch) and filesChanged/files stays scoped to actual writes only. 4. test/indexes.test.ts: new describe block for orphanedIndexPaths -- orphan detected (present in existing, absent from graph, directly and via descendants), live dirs never flagged, sorted output. test/sync.test.ts: a sync run where an index.md exists on disk for a directory with no concepts asserts it's surfaced in report.orphanedIndexes and NOT deleted/NOT silently dropped. 5. bun test + bun run typecheck; mutation-check the new test by confirming it fails against the pre-fix orphan-blind code path.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented: (1) indexes.ts adds exported orphanedIndexPaths(g, existing) -- a pure diff of existing's keys against the live index-dir set (factored into a new liveIndexDirs(g) helper, also used unchanged by generateIndexes so its own signature/behavior/AC#1 fixpoint are untouched -- rename.ts's call site keeps compiling identically). (2) sync.ts's regenerateIndexAndLog now also computes+returns orphaned paths; runSync threads them into a new SyncReport.orphanedIndexes field (DOCS_DIR-prefixed) and render() emits a distinct 'orphaned index ...' line (not counted in filesChanged/files -- the file is reported but deliberately left untouched, not auto-deleted). --no-index skips detection too. Verification: bun test -> 1830 pass/0 fail (up from 1818, +12 new tests: 6 in test/indexes.test.ts for orphanedIndexPaths incl. direct-orphan, descendant-only-orphan, live-intermediate-hub-not-flagged, sorted-multi-orphan, empty-map cases; 6 in test/sync.test.ts incl. AC#1/2 report+untouched-bytes, AC#3 live-dir-unaffected, plain-text render line, second-run-stays-reported, --no-index, clean-bundle). bun run typecheck -> clean. Mutation check: git-stashed the indexes.ts+sync.ts fix and reran the new tests -- module-load SyntaxError (orphanedIndexPaths not exported) plus 5 assertion failures against undefined, confirming the tests actually discriminate the pre-fix code. bun run lint: pre-existing 1 error/4 infos in unrelated files (context.test.ts, supersede.test.ts, managed-block.test.ts) confirmed present on unmodified HEAD via git stash -- none in the 4 files this task touched.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed generateIndexes never detecting a stale/orphaned sub-index directory. Added indexes.ts:orphanedIndexPaths(g, existing), a pure function comparing existing's on-disk index.md paths against the live index-directory set (factored via a new liveIndexDirs(g) helper shared with generateIndexes, whose own signature/output/AC#1 fixpoint stay byte-identical -- rename.ts's call site is unaffected). sync.ts's regenerateIndexAndLog now also returns orphaned paths; runSync surfaces them as a new SyncReport.orphanedIndexes field, reported via a distinct 'orphaned index ...' line in sync's plain/pretty output (not counted toward filesChanged -- the file is flagged, not silently touched or auto-deleted). --no-index still skips this. Verified: bun test (1830 pass/0 fail, 12 new tests across test/indexes.test.ts and test/sync.test.ts) and bun run typecheck (clean). Mutation-checked: stashing the fix makes the new tests fail (module export missing + 5 assertion failures), proving they discriminate the bug.
<!-- SECTION:FINAL_SUMMARY:END -->
