---
id: LCLI-353
title: >-
  Support Quest 0.2.7 and 0.2.8 in the Lore version gate — 0.3.4 publication
  follow-up
status: To Do
assignee: []
created_date: '2026-08-28 00:02'
labels:
  - release
  - quest
  - adapter
dependencies:
  - LCLI-352
priority: high
type: bug
ordinal: 474000
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 #1 Version gate accepts exactly Quest 0.2.7 and 0.2.8 (bounded set, no unbounded range) with structured-criteria validation retained; test-first coverage proves acceptance of both and rejection of other versions with hints naming the supported set; #2 install/drift hints name the supported set everywhere the old single-version hint appeared; #3 paired packed/installed E2E against the exact Quest 0.2.8 candidate: link/back-reference, sync, tasks rollup, validate/check strict, and the public quest task-binding contract through the Opum facade; #4 0.3.4 candidate/provenance/dry-run regenerated only after merge to dev, earlier f4aefe3 candidate invalidated; no npm publish/login/MFA/auth/dist-tag or registry writes
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Test-first version-gate coverage. 2. Bounded SUPPORTED_QUEST_VERSIONS gate + hint updates. 3. Focused tests + full suite + lint/typecheck. 4. PR to dev, green merge. 5. Paired E2E vs exact quest 0.2.8 candidate incl. task-binding contract. 6. Regenerate 0.3.4 candidate/provenance/dry-run from a fresh publish:false Release run; invalidate f4aefe3 candidate.
<!-- SECTION:PLAN:END -->
