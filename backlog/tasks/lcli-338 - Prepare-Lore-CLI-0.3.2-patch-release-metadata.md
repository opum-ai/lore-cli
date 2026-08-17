---
id: LCLI-338
title: Prepare Lore CLI 0.3.2 patch release metadata
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-17 00:30'
updated_date: '2026-08-17 03:46'
labels:
  - release
  - patch
  - npm
  - packaging
dependencies: []
priority: high
type: task
ordinal: 461000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prepare the successor patch release for LCLI-337. Version v0.3.1 has an immutable tag and a failed publish=false qualification; it must not be published. After the packaged Backlog isolation fix merges to main, align all manifests and release documentation at 0.3.2, qualify the new tag and workflow artifacts, and leave interactive publication to the owner.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All seven package manifests and root exact optional dependency pins use 0.3.2.
- [x] #2 CHANGELOG and release-truth documentation explain the packaged Backlog isolation fix and record that v0.3.1 was never published.
- [ ] #3 Release candidate passes local and CI qualification, including all matching-host package qualifications with the protected environment sentinel.
- [ ] #4 Only a publish=false release workflow is dispatched; interactive publication uses its exact generated artifacts after owner review.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Align all shipped manifests and exact optional-dependency pins at 0.3.2 after the LCLI-337 fix is on main.
2. Update changelog and release-truth records to distinguish the unpublished v0.3.1 tag from the new candidate.
3. Qualify the candidate locally and through dev/main CI.
4. Tag verified main, dispatch Release with publish=false, and provide owner-only artifact publication commands after artifacts exist.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
2026-08-17: aligned all seven manifests and exact optional dependency pins at 0.3.2; documented LCLI-337 and that v0.3.1 is immutable and unpublished. Local candidate qualification passed lint, typecheck, build, full Bun suite, strict Lore check/validate, agents check, and diff hygiene.

2026-08-17: refreshed only the small and large canonical-export baselines for the 0.3.2 version-bearing projection. Source-inventory and task-snapshot digests remain unchanged; local small smoke and the focused fixture/workflow suite pass.

2026-08-17: refreshed the deterministic Ladybug report-contract digest that contains the fixture’s version-bearing canonical export hash. Focused contract test and the full Bun suite pass locally.
<!-- SECTION:NOTES:END -->
