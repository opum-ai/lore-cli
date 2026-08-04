---
id: LCLI-297
title: Ship a Windows ARM64 Lore binary
status: In Progress
assignee:
  - '@codex'
created_date: '2026-08-04 03:59'
updated_date: '2026-08-04 04:02'
labels:
  - 'doc:stories/prepare-the-first-lore-cli-release'
dependencies: []
documentation:
  - docs/stories/prepare-the-first-lore-cli-release.md
priority: medium
type: feature
ordinal: 410000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add Windows ARM64 to Lore’s compiled release and npm distribution matrix so native ARM64 Node/npm installations on Windows receive a matching Lore executable. Preserve the approved Windows LadybugDB fallback policy when no compatible native addon is available.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release workflow compiles and packages a win32-arm64 Lore executable on an appropriate matching host
- [ ] #2 The root launcher package declares and resolves a win32-arm64 optional dependency with correct npm os/cpu metadata
- [ ] #3 Release verification, qualification, packaging, and publish-count assertions include all supported platform packages without stale hard-coded counts
- [ ] #4 Automated tests cover win32-arm64 launcher/package resolution and unsupported-platform messaging
- [ ] #5 Release and platform-support documentation names Windows ARM64 and records its LadybugDB support policy
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit release/package/test assumptions and upstream Bun/LadybugDB Windows ARM64 availability. 2. Add the win32-arm64 package and matrix entry, then replace stale five-platform assertions/messages. 3. Extend automated coverage and update canonical release documentation through Lore conventions. 4. Run focused tests, static checks, packaging verification where feasible, and native winvm qualification if required.
<!-- SECTION:PLAN:END -->
