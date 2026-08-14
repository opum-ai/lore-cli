---
id: LCLI-332
title: Release the Lore Backlog knowledge-adoption contract
status: To Do
assignee: []
created_date: '2026-08-14 18:04'
labels:
  - release
  - quest
  - backlog
  - migration
  - knowledge
  - quest-0.1-blocker
dependencies:
  - LCLI-331
priority: high
type: task
ordinal: 455000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Publish the first Lore release that contains the public Backlog knowledge-adoption contract required by Quest full-fidelity migration. Publication remains a separate owner-authorized action and must not be inferred from implementation completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The release version is selected according to Lore semver policy after checking the current published version
- [ ] #2 All platform artifacts contain the same knowledge-adoption manifest and behavior
- [ ] #3 Clean-install and migration smoke tests pass against the immutable release artifacts
- [ ] #4 Publication occurs only with explicit owner authorization and immutable release evidence is recorded
<!-- AC:END -->
