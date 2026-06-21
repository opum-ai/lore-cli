---
id: LORE-12
title: 'Output layer: --plain, --json, and pretty modes'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
labels:
  - core
  - agent-api
milestone: m-1
dependencies: []
documentation:
  - docs/reference/cli-contract.md
priority: high
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Three output tiers with precedence --json > --plain > pretty; auto-plain on non-TTY; stdout=data, stderr=diagnostics; honor NO_COLOR.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 JSON output uses the schemaVersion/kind/data envelope
- [ ] #2 Non-TTY auto-selects plain; --json overrides
<!-- AC:END -->
