---
id: LORE-15
title: 'concept.ts: frontmatter parse/serialize + Zod per-type schemas'
status: To Do
assignee: []
created_date: '2026-06-21 06:25'
updated_date: '2026-06-21 06:28'
labels:
  - core
milestone: m-2
dependencies:
  - LORE-11
documentation:
  - docs/adr/0006-schema-types-templates.md
  - docs/adr/0011-frontmatter-serialization-stability.md
priority: high
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
gray-matter parse/serialize with byte-stable round-trip; strict Zod schemas for known types, lenient type-only for unknown; pass through custom keys.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Round-tripping a doc is byte-identical
- [ ] #2 Unknown types validate on type only and keep extra keys
<!-- AC:END -->
