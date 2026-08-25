---
id: LCLI-333.2
title: Pin cross-backend TrackerAdapter parity as a contract suite
status: Done
assignee: []
created_date: '2026-08-25 17:52'
updated_date: '2026-08-25 18:08'
labels:
  - quest
  - tracker
  - parity
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies: []
parent_task_id: LCLI-333
priority: high
type: task
ordinal: 470000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Both backlog and quest adapters project equivalent raw envelopes to the same neutral BacklogTaskDetail except the documented aliases/file deltas
- [x] #2 One edit patch expands to each backend's documented flag contract (backlog comma-join §2.4, quest repeated per-value flags + actor flags)
- [x] #3 Transport and envelope failures classify identically; payload-shape asymmetry (backlog validation vs quest drift) is pinned
- [x] #4 Flag-like caller data is rejected before any spawn on both adapters
- [x] #5 Quest storage-path neutrality is characterized: commitBacklogFiles([]) is a no-op and non-backlog paths fail loud
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Delivered in test/tracker-adapter-parity.test.ts as the L0 regression fence for the LCLI-333.1 backend-owned persistence slice. No production changes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered test/tracker-adapter-parity.test.ts (6 tests, 28 assertions) on feature/lcli-333-cutover-parity-frontier: neutral-projection parity with documented aliases/file deltas, edit-flag contract parity, failure-classification parity (pinned backlog validation vs quest drift asymmetry), flag-like rejection before spawn, and storage-path-neutrality characterization of the commitBacklogFiles seam. Focused suite green; typecheck and biome clean; lore validate/check exit 0; full bun test 2633 pass / 5 pre-existing config.test.ts failures identical at pinned base 2fef9022.
<!-- SECTION:FINAL_SUMMARY:END -->
