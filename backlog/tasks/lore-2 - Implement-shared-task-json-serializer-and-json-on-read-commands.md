---
id: LORE-2
title: Implement shared task-json serializer and --json on read commands
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:27'
labels:
  - backlog-fork
milestone: m-0
dependencies:
  - LORE-1
documentation:
  - docs/reference/backlog-json-schema.md
priority: high
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add src/formatters/task-json.ts and a per-command --json flag (json-before-plain) to task list, task view (+ task id), and search. Normalize lastModified to ISO string; omit rawContent by default.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 task list/view/search --json emit the canonical schemaVersion/kind/data envelope
- [ ] #2 No icons in status; filePath present; AC/DoD indices documented as non-durable
<!-- AC:END -->
