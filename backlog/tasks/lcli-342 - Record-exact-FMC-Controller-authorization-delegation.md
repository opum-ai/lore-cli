---
id: LCLI-342
title: Record exact FMC Controller authorization delegation
status: In Progress
assignee:
  - '@lore-cli'
created_date: '2026-08-18 16:55'
labels: []
dependencies: []
priority: high
type: chore
ordinal: 465000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Correct the repository-local FMC delegation ledger so addressed work and exact Controller allow decisions from opum-doc authorize only repository-local work and validated delivery to the configured origin/dev integration branch without duplicate user approval.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AGENTS.md names opum-doc as the only Controller and contains no lore-doc reference
- [ ] #2 AGENTS.md records the exact addressed-message and Controller-allow delegation limited to this repository, configured origin, and dev
- [ ] #3 The corrective commit validates cleanly and preserves the pre-existing three-commit stack
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the existing FMC routing commits and delegation ledger. 2. Add the explicit scoped exact-allow authorization text. 3. Validate the diff and commit without rewriting prior history.
<!-- SECTION:PLAN:END -->
