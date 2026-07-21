---
id: LORE-150
title: generateIndexes never detects or removes an orphaned sub-index directory
status: To Do
assignee: []
created_date: '2026-07-21 22:26'
labels:
  - codex-review-followup
  - core-index-context
dependencies: []
references:
  - >-
    backlog/docs/reviews/doc-2 -
    Codex-second-opinion-review-—-lore-codebase-2026-07-20.md
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
- [ ] #1 Given a docs bundle where a directory's on-disk index.md exists in `options.existing` but the directory has no concepts (directly or via descendants) in the current graph, `lore sync` either removes/flags that stale index.md or reports it as an orphaned/stale index in its output — it is no longer silently left untouched.
- [ ] #2 A new test in test/indexes.test.ts (or test/sync.test.ts) exercises this scenario: seed `existing` with an index.md for a directory absent from the current graph's concepts, run generateIndexes/sync, and assert the orphaned index is detected (removed from the result map, or surfaced as a distinct reported change) rather than passed through silently.
- [ ] #3 Existing directories that still hold live concepts continue to regenerate exactly as before (no regression to the fixpoint/AC#1 behavior documented at indexes.ts:99-101).
<!-- AC:END -->
