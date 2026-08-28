---
id: LCLI-353
title: >-
  Support Quest 0.2.7 and 0.2.8 in the Lore version gate — 0.3.4 publication
  follow-up
status: To Do
assignee: []
created_date: '2026-08-28 00:02'
updated_date: '2026-08-28 00:15'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Dual-version gate implemented test-first (bd9b0d5, PR #430 green-merged to dev c26180d): frozen SUPPORTED_QUEST_VERSIONS=[0.2.7,0.2.8]; probe() gate accepts exactly that set; 16 hint sites + INSTALL_HINT + schemaVersion message now name the supported set; structured-criteria validation from LCLI-352 retained. Focused 15/15 (2 new gate tests: accept both; reject 0.1.0/0.2.6/0.2.9/0.3.0/empty with set-naming hint); full suite 2667/0/1; typecheck/lint clean. Paired packed/installed E2E vs npm quest@0.2.7 (0.2.7 arm, repo e2e-0.3.4-dual): link.result added+backRef, sync, rollup, validate/check --strict clean, quest backref present. AC#3 0.2.8 arm: BLOCKED on the external quest candidate — registry shows @opum-ai/quest versions [0.1.0, 0.2.7] only (checked 2026-08-27); the exact-candidate paired E2E (incl. quest task binding contract through the fixed facade) runs when quest-cli publishes 0.2.8 under correlation 90183b29; the 0.2.8 acceptance arm is proven by the focused gate tests meanwhile. Candidate regeneration DONE: Release run 33128763035 (publish:false, success) on dev c26180d; artifact 9669482580 staged at /Volumes/external/.opum-candidates/opum-doc-qualification-2026-08-27/final-lore-c26180d (provenance.json sha256-OK with 7 tarball rows incl. supported_quest_versions field, SHA256SUMS.txt, inventory, fresh all-seven dry-run). Earlier candidate final-lore-a4322b7 INVALIDATED (INVALIDATED.md marker: superseded by the dual-version gate; do not publish).
<!-- SECTION:NOTES:END -->
