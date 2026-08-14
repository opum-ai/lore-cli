---
id: LCLI-330
title: Specify the Lore contract for adopting Backlog knowledge records
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
dependencies: []
priority: high
type: docs
ordinal: 453000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the versioned public Lore CLI and manifest contract used when Quest adopts Backlog documents and decisions. The contract must let Quest coordinate a two-product migration without reading or writing Lore private files or databases, and must expose enough provenance and compensation evidence for deterministic rollback.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A versioned preview, apply, status, and rollback command contract is documented with machine-readable result kinds
- [ ] #2 Backlog decisions map to ADR, specs to Spec, guides and runbooks to Runbook, and other or readme material to Reference
- [ ] #3 Preview returns stable source provenance, proposed concept IDs or creation handles, collisions, fidelity gaps, and an approval digest without mutation
- [ ] #4 Apply and rollback return exact created concept IDs and paths so a coordinator can compensate in reverse order
- [ ] #5 The contract preserves Lore ownership: callers never write Lore files, managed blocks, indexes, or the local graph directly
<!-- AC:END -->
