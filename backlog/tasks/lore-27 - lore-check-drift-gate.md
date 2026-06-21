---
id: LORE-27
title: lore check (drift gate)
status: To Do
assignee: []
created_date: '2026-06-21 06:26'
updated_date: '2026-06-21 06:28'
labels:
  - cmd
  - ci
milestone: m-3
dependencies:
  - LORE-22
  - LORE-23
documentation:
  - docs/adr/0007-validation-and-coherence.md
priority: high
ordinal: 27000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read-only drift report (status, managed-block) for CI; exit code 6 on drift.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 check never writes
- [ ] #2 Exit 6 on drift, 0 when clean
<!-- AC:END -->
