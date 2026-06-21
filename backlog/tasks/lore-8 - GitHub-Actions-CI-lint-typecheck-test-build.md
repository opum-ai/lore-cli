---
id: LORE-8
title: 'GitHub Actions CI: lint, typecheck, test, build'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - ci
milestone: m-1
dependencies:
  - LORE-6
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CI matrix uses bun test --isolate, --linker=isolated, and Windows --max-concurrency=4.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 CI runs on PRs to dev and pushes
- [ ] #2 Windows job is stable
<!-- AC:END -->
