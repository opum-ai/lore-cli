---
id: LCLI-343
title: Allow lore init without an issue tracker
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-18 20:30'
updated_date: '2026-08-19 03:27'
labels:
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies: []
documentation:
  - docs/stories/track-lore-cli-tracker-backend-integration.md
priority: medium
type: feature
ordinal: 466000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Current tracker selection supports Quest, Backlog, and Jira; offer an explicit no-tracker mode for bundles that need OKF documentation without issue-tracker coupling. Define CLI and persisted config behavior, compatibility for existing bundles, validation, and tests. Do not silently select a tracker.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 lore init exposes an explicit no-tracker selection and noninteractive flag/config form
- [ ] #2 Generated config represents no-tracker mode without credentials or tracker probes
- [ ] #3 Existing tracker-backed and legacy bundles retain current behavior
- [ ] #4 Validation and init tests cover no-tracker, incompatibilities, and diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current tracker selection/init/config semantics. 2. Add explicit no-tracker choice and persistence without tracker probe. 3. Preserve existing tracker and legacy behavior. 4. Add focused tests.
<!-- SECTION:PLAN:END -->
