---
id: LCLI-331
title: Implement Backlog knowledge adoption through Lore public commands
status: To Do
assignee: []
created_date: '2026-08-14 18:03'
labels:
  - quest
  - backlog
  - migration
  - knowledge
  - interop
  - quest-0.1-blocker
dependencies:
  - LCLI-330
priority: high
type: feature
ordinal: 454000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the accepted Backlog knowledge-adoption contract in lore-cli. All authored documentation changes remain Lore-managed, all operations are idempotent and source-read-only, and rollback removes only artifacts owned by the approved migration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The versioned preview, apply, status, and rollback commands implement the accepted manifest and result contract
- [ ] #2 Repeated preview is byte-stable for an unchanged source and apply requires the exact approved digest
- [ ] #3 Created concepts carry source repository, revision, source path, source record type, and migration identity provenance
- [ ] #4 Fault injection proves exact compensation or a blocked-incomplete report without false success
- [ ] #5 Lore sync, strict validation, strict check, unit tests, and integration tests pass
<!-- AC:END -->
