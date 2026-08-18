---
id: LCLI-342
title: Record exact FMC Controller authorization delegation
status: Done
assignee:
  - '@lore-cli'
created_date: '2026-08-18 16:55'
updated_date: '2026-08-18 16:55'
labels: []
dependencies: []
modified_files:
  - AGENTS.md
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
- [x] #1 AGENTS.md names opum-doc as the only Controller and contains no lore-doc reference
- [x] #2 AGENTS.md records the exact addressed-message and Controller-allow delegation limited to this repository, configured origin, and dev
- [x] #3 The corrective commit validates cleanly and preserves the pre-existing three-commit stack
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Inspect the existing FMC routing commits and delegation ledger. 2. Add the explicit scoped exact-allow authorization text. 3. Validate the diff and commit without rewriting prior history.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validation: git diff --check origin/dev..9d68f41 and git show --check 9d68f41 passed; AGENTS.md contains opum-doc and no lore-doc reference. The linear pre-existing stack 4316181, f38f85d, and 9d53565 remains intact before corrective commit 9d68f41.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Recorded the exact opum-doc addressed-message and FMC allow delegation, bounded to repository-local work and validated origin/dev delivery; preserved direct-user gates and the existing commit stack.
<!-- SECTION:FINAL_SUMMARY:END -->
