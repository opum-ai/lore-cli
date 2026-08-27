---
id: LCLI-352
title: >-
  Quest 0.2.7 structured acceptanceCriteria breaks lore link — release-blocking
  0.3.4 patch
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-27 22:11'
updated_date: '2026-08-27 22:28'
labels:
  - release
  - quest
  - adapter
dependencies: []
priority: high
type: bug
ordinal: 473000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 Test-first repro: adapter criteria parsing accepts Quest 0.2.7 structured {index,text,checked} acceptanceCriteria and definitionOfDone output; legacy string arrays handled per the pinned Quest 0.2.7 contract; #2 lore link/back-reference, sync, tasks rollup, and validate/check --strict pass against public Quest 0.2.7 in a packed/installed paired black-box E2E; #3 family version bump to 0.3.4 with CHANGELOG entry, digested candidate family, and fresh publish --dry-run evidence (no registry writes); #4 No scope widening beyond the adapter criteria seam and release metadata
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reproduce with test-first adapter test against Quest 0.2.7 shapes. 2. Lossless map of {index,text,checked} to BacklogCriterion in src/adapters/quest.ts criteria(); retain legacy string arrays only if the pinned 0.2.7 contract requires. 3. Focused tests + full repo checks. 4. Packed/installed paired E2E vs public Quest 0.2.7. 5. 0.3.4 family bump, build, pack, digest manifest, dry-run evidence. 6. Two-axis review + verify, PR to dev, green merge, lease return.
<!-- SECTION:PLAN:END -->
