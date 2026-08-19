---
id: LCLI-333
title: Release Lore with Quest as the default tracker backend
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-14 18:09'
updated_date: '2026-08-19 03:28'
labels:
  - release
  - quest
  - tracker
  - default-backend
  - 'doc:stories/track-lore-cli-tracker-backend-integration'
dependencies:
  - LCLI-315.4
  - LCLI-332
documentation:
  - docs/stories/track-lore-cli-tracker-backend-integration.md
priority: high
type: task
ordinal: 456000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the Lore release that makes Quest the explicit default for new bundles after @opum-ai/quest is publicly available and LCLI-315.4 passes. Existing tracker choices and zero-config Backlog bundles must retain the approved migration-or-pin behavior. Publication remains a separate owner-authorized action.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release version follows Lore semver policy and depends on a verified public Quest version
- [ ] #2 New-bundle, legacy Backlog, explicit Backlog, explicit Jira, missing Quest, incompatible Quest, migration, and pinning clean-install tests pass against immutable artifacts
- [ ] #3 Published manifests, documentation, and package metadata agree on Quest as the new-bundle default without rewriting existing explicit configuration
- [ ] #4 Publication occurs only with explicit owner authorization and immutable release evidence is recorded
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Ground release dependencies and public Quest availability. 2. Identify the next candidate version and package contents from the exact Wave A tree. 3. Record immutable local qualification evidence only. 4. Do not publish without later exact Controller release gate.
<!-- SECTION:PLAN:END -->
