---
id: LORE-20
title: lore schema export (Zod to JSON Schema + modeline)
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
  - docs/adr/0006-schema-types-templates.md
priority: medium
ordinal: 20000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Emit Draft-7 JSON Schema via Zod toJSONSchema per type to .lore/schemas/, plus a yaml.schemas snippet and modeline maintenance for editor autocomplete.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exported schema drives YAML autocomplete in VS Code/Obsidian
- [ ] #2 Custom user types export too
<!-- AC:END -->
