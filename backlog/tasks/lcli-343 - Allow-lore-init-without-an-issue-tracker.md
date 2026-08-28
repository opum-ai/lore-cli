---
id: LCLI-343
title: Allow lore init without an issue tracker
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-18 20:30'
updated_date: '2026-08-19 03:37'
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
- [x] #1 lore init exposes an explicit no-tracker selection and noninteractive flag/config form
- [x] #2 Generated config represents no-tracker mode without credentials or tracker probes
- [x] #3 Existing tracker-backed and legacy bundles retain current behavior
- [x] #4 Validation and init tests cover no-tracker, incompatibilities, and diagnostics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect current tracker selection/init/config semantics. 2. Add explicit no-tracker choice and persistence without tracker probe. 3. Preserve existing tracker and legacy behavior. 4. Add focused tests.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Wave A: explicit tracker none persists disabled coupling, suppresses implicit probes, preserves existing explicit and legacy selection behavior.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added explicit no-tracker init/config support with disabled-coupling diagnostics and no credential/probe behavior. Verified by focused config/init/tracker tests plus cumulative quality gates.
<!-- SECTION:FINAL_SUMMARY:END -->
