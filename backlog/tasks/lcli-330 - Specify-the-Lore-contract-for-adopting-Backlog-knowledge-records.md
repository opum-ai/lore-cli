---
id: LCLI-330
title: Specify the Lore contract for adopting Backlog knowledge records
status: Done
assignee:
  - '@codex'
created_date: '2026-08-14 18:03'
updated_date: '2026-08-14 23:18'
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
- [x] #1 A versioned preview, apply, status, and rollback command contract is documented with machine-readable result kinds
- [x] #2 Backlog decisions map to ADR, specs to Spec, guides and runbooks to Runbook, and other or readme material to Reference
- [x] #3 Preview returns stable source provenance, proposed concept IDs or creation handles, collisions, fidelity gaps, and an approval digest without mutation
- [x] #4 Apply and rollback return exact created concept IDs and paths so a coordinator can compensate in reverse order
- [x] #5 The contract preserves Lore ownership: callers never write Lore files, managed blocks, indexes, or the local graph directly
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Define a versioned public adoption contract as a new Lore Specification: operation lifecycle, source-record mapping, result kinds, and non-mutation boundaries.
2. Specify deterministic preview approval, provenance, collision/fidelity reporting, apply/rollback compensation, and status semantics.
3. Cross-reference the contract from the CLI and Backlog operational references without implying that Quest is published or selected as a default.
4. Run Lore reconciliation and strict documentation gates; obtain independent review, then settle and deliver to dev.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Campaign initialized against dev SHA 2ba7504e0b1d2134ff18e5cc053af991fc4ab3c9. LCLI-330 is the first ready task; LCLI-331 depends on it.

Paused before contract authoring: acceptance criteria require a new public command namespace and approval-digest/manifest shape for a cross-product migration. Repository authority requires an explicit product-contract decision before those interface commitments are documented.

Human decision recorded 2026-08-14: use the explicit Backlog-specific public namespace `lore backlog adopt` with preview, apply, status, and rollback. Preview emits a versioned approval receipt; apply requires its exact digest.

Merged to dev in PR #379 (merge commit 302d307340bed18bacc400a7e719e24a82b93cc1). Exact merged-tree evidence: lore validate --strict (73 files, 0 errors/warnings), lore check --strict (73 files, 0 errors/warnings), git diff --check; all eight PR CI checks passed, including Docker E2E.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Specified and delivered the Backlog-only `lore backlog adopt` public contract: preview/apply/status/rollback result kinds, deterministic approval receipt, mapping/provenance, ownership fences, and reverse-order rollback evidence. Verified on merged dev and PR #379 CI.
<!-- SECTION:FINAL_SUMMARY:END -->
