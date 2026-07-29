---
id: LORE-43
title: Confluence one-way publish adapter (deferred)
status: To Do
assignee: []
created_date: '2026-06-21 06:27'
updated_date: '2026-06-21 06:28'
labels:
  - deferred
  - confluence
milestone: m-8
dependencies:
  - LORE-28
documentation:
  - docs/adr/0016-confluence-one-way-publish-deferred.md
priority: low
ordinal: 43000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
DEFERRED: confluence.ts (v2 REST, version-conflict-tolerant PUT), markdown->ADF renderer subsystem, sync-state.json hash idempotency, provenance banner, lore publish confluence --dry-run.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Changed-only publish via content hash
- [ ] #2 Provenance banner injected on every page
<!-- AC:END -->
