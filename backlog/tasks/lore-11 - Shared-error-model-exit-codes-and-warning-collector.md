---
id: LORE-11
title: 'Shared error model, exit codes, and warning collector'
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
  - docs/adr/0005-cli-contract.md
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Semantic exit codes 0/2/3/4/5/6 + --json error envelope error_type/message/hint/input; warnings-not-errors collector.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Every error path returns a documented exit code
- [ ] #2 Errors render as JSON envelope under --json on stderr
<!-- AC:END -->
