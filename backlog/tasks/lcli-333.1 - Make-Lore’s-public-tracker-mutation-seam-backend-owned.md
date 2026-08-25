---
id: LCLI-333.1
title: Make Lore’s public tracker mutation seam backend-owned
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-21 23:07'
updated_date: '2026-08-25 20:57'
labels: []
dependencies: []
parent_task_id: LCLI-333
ordinal: 469000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Route task-path/back-reference mutation and persistence/commit side effects through the selected TrackerAdapter for link, unlink, rename, and sync. Quest selection must invoke only Quest public CLI/schema-1 operations and never Backlog or Backlog Git commits; Backlog selection remains byte-for-byte/semantically compatible. No fallback, dual write, or ambiguous backend.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The selected TrackerAdapter owns task-path/back-reference mutation and any persistence/commit side effects needed by link, unlink, rename, and sync; commands do not assume backlog/ paths.
- [x] #2 With tracker=quest, link/unlink/rename/sync invoke only Quest public CLI/schema-1 operations; they never invoke Backlog, mutate backlog/, or issue Backlog Git commits.
- [x] #3 With tracker=backlog, current public behavior, file ownership, diagnostics, and scoped Git commits remain byte-for-byte/semantically compatible.
- [x] #4 Link/unlink/rename/sync/task-resolution/orphan/reconciliation behavior has backend-parity tests against both adapters.
- [x] #5 Selection is single-valued and fail-loud: no fallback, dual write, or ambiguous backend.
- [x] #6 Quest task paths outside backlog/ are accepted through the backend seam without weakening general repository path safety.
- [x] #7 Focused tests plus full repository checks and strict Lore validation/check pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. tracker-persistence.ts owns per-run persistence keyed off one resolveSelectedBackend call: backlog delegates unchanged to commitBacklogFiles/commitBacklogIfDirty; quest performs zero git and drifts on any non-null repo file. 2. link/unlink/rename/sync collect TrackerWriteRef[] and persist through the seam. 3. cutover-state.ts + tracker-cutover.ts coordinate Quest migration with knowledge adoption via durable .lore/cutover/state.json phases planned->legs-applied->archived->done; lore init gains --adopt-manifest/--approval-digest. 4. backlog-archive.ts + zip-store.ts implement verified STORE-zip archive-and-delete into ignored .lore/archive evidence with symlink/unsafe-entry/per-file-drift refusal. 5. Standalone lore backlog adopt apply locked mid-cutover.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered on feat/lcli-333-quest-cutover-l1 (base origin/dev 640fbb7): backend-owned persistence seam (tracker-persistence.ts), coordinated two-leg cutover coordinator with durable phase markers, verified STORE-zip archive-and-delete into ignored .lore/archive evidence, standalone adopt-apply lock mid-cutover. Full bun test 2652 pass / 5 pre-existing config.test.ts failures identical at base; typecheck+biome clean; strict lore validate/check exit 0; git diff --check clean. Two independent read-only reviews + verify child PASS. End-to-end smoke vs real Backlog 1.50.1 + Quest 0.2.7: legacy bundle migrated (TASK-1/2 -> T-1/T-2), decision record adopted to docs/adr/smoke-adoption-decision.md, backlog/ archived and deleted, [tracker].backend=quest persisted, cutover phase done.
<!-- SECTION:NOTES:END -->
