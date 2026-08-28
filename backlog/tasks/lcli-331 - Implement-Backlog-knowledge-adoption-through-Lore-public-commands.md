---
id: LCLI-331
title: Implement Backlog knowledge adoption through Lore public commands
status: Done
assignee: []
created_date: '2026-08-14 18:03'
updated_date: '2026-08-18 23:18'
labels:
  - quest
  - backlog
  - migration
  - knowledge
  - interop
  - quest-0.1-blocker
  - 'doc:stories/adopt-backlog-knowledge-through-lore'
dependencies:
  - LCLI-330
documentation:
  - docs/stories/adopt-backlog-knowledge-through-lore.md
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
- [x] #1 The versioned preview, apply, status, and rollback commands implement the accepted manifest and result contract
- [x] #2 Repeated preview is byte-stable for an unchanged source and apply requires the exact approved digest
- [x] #3 Created concepts carry source repository, revision, source path, source record type, and migration identity provenance
- [x] #4 Fault injection proves exact compensation or a blocked-incomplete report without false success
- [x] #5 Lore sync, strict validation, strict check, unit tests, and integration tests pass
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Final verification at feature commit 69ec0bb: bun run lint, bun test, bun run typecheck, authority-gated lore sync, strict Lore validation/check, and git diff --check passed. Independent final review cleared lifecycle and manifest findings.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented digest-guarded Backlog knowledge adoption preview/apply/status/rollback with deterministic receipts, provenance-bearing concepts, idempotency, compensation, and public help/docs. Verified by full test suite, lint, typecheck, strict Lore gates, and independent review.
<!-- SECTION:FINAL_SUMMARY:END -->
