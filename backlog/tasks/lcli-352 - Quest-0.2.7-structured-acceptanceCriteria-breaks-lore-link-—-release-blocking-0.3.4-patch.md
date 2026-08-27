---
id: LCLI-352
title: >-
  Quest 0.2.7 structured acceptanceCriteria breaks lore link — release-blocking
  0.3.4 patch
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-27 22:11'
updated_date: '2026-08-27 23:45'
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

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation + E2E evidence: criteria() structured-only mapping committed 4437d10 with test-first coverage (26 focused pass; full suite 2665 tests 0 fail 1 skip; typecheck/lint clean). Packed/installed black-box E2E vs npm-published quest@0.2.7 (repo e2e-0.3.4c): lore init --tracker quest --migrate-backlog, new story, link --json = link.result T-1 added + backRef added (0.3.3 fails exit 6 here), sync, tasks rollup T-1, validate/check --strict clean, quest task view documentation backref present. Root-cause notes for the record: (1) Bun 1.3.14 Bun.build served a stale transpiler cache from the pre-fix 0.3.3 build producing a stale candidate binary (deterministic-hash confirmed; 1.4.0 rebuild f202f1de carries the fix) — builds for candidates must use a fresh transpiler state; (2) ~/.local/bin/quest is a stale build claiming 0.2.7 but emitting legacy string criteria; npm-published @opum-ai/quest@0.2.7 emits the structured contract; compiled lore binaries resolve quest from PATH so PATH hygiene matters. Version-bearing baselines refreshed for 0.3.4 (bc68882 ladybug fixture digests; c621296 digest-pinned report golden). PR #427 merged to dev f4aefe3.
<!-- SECTION:NOTES:END -->
