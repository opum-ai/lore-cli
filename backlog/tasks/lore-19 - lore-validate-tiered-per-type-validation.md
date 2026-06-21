---
id: LORE-19
title: 'lore validate: tiered per-type validation'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
milestone: m-2
dependencies:
  - LORE-15
documentation:
  - docs/adr/0007-validation-and-coherence.md
  - docs/reference/okf-conformance.md
priority: high
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
OKF section 9 conformance = error; per-type frontmatter shape + required sections = error; unknown type / extra key = warning; plus frontmatter quote-safety.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Unknown types do not fail validation
- [ ] #2 validate [PATHS] supports staged-only pre-commit
<!-- AC:END -->
