---
id: LCLI-338
title: Prepare Lore CLI 0.3.2 patch release metadata
status: To Do
assignee:
  - '@codex'
created_date: '2026-08-17 00:30'
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
- [ ] #1 All seven package manifests and root exact optional dependency pins use 0.3.2.
- [ ] #2 CHANGELOG and release-truth documentation explain the packaged Backlog isolation fix and record that v0.3.1 was never published.
- [ ] #3 Release candidate passes local and CI qualification, including all matching-host package qualifications with the protected environment sentinel.
- [ ] #4 Only a publish=false release workflow is dispatched; interactive publication uses its exact generated artifacts after owner review.
<!-- AC:END -->
