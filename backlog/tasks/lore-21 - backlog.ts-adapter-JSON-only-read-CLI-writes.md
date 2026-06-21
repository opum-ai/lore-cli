---
id: LORE-21
title: 'backlog.ts adapter: JSON-only read + CLI writes'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - core
  - adapter
milestone: m-3
dependencies:
  - LORE-5
documentation:
  - docs/reference/backlog-cli-contract.md
  - docs/reference/backlog-json-schema.md
  - docs/adr/0002-backlog-integration-json-only.md
priority: high
ordinal: 21000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Read via --json and JSON.parse the envelope; capability probe + min-version (fail-loud); write via task create/edit; capture new id from the Created task line; existence via edit/list never view.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Adapter never parses --plain text
- [ ] #2 Probe refuses a non --json-capable Backlog
<!-- AC:END -->
