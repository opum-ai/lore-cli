---
id: LORE-18
title: lore new with templates
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
priority: high
ordinal: 18000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Scaffold typed concepts from .lore/templates/<type>.md with {{placeholders}} and --var; inject the $schema modeline, a stub summary, and the required-section skeleton.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 New docs validate clean by construction
- [ ] #2 User templates override bundled defaults
<!-- AC:END -->
