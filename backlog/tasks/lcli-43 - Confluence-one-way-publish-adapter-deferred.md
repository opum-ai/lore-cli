---
id: LCLI-43
title: Confluence one-way publish adapter (deferred)
status: To Do
assignee: []
created_date: '2026-07-28 20:13'
updated_date: '2026-08-03 16:10'
labels:
  - deferred
  - confluence
  - 'doc:stories/hold-deferred-lore-capabilities'
milestone: m-11
dependencies:
  - LCLI-28
documentation:
  - docs/adr/0016-confluence-one-way-publish-deferred.md
  - docs/stories/hold-deferred-lore-capabilities.md
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
