---
type: Story
title: Adopt Backlog knowledge through Lore
tags:
  - backlog
  - knowledge
  - adoption
  - migration
  - interop
summary: Record the completed Backlog knowledge-adoption contract and implementation as a scoped Lore CLI ownership surface.
timestamp: 2026-08-18T23:15:17.720Z
status: done
tasks:
  - lcli-330
  - lcli-331
---

# Adopt Backlog knowledge through Lore

## Goal

Keep the completed Backlog knowledge-adoption contract and implementation attached to one scoped ownership record. This Story covers the public `lore backlog adopt` surface only; it does not select Lore's tracker, make an availability claim for Quest, or authorize a product release.

## Acceptance criteria

- The documented command contract, implementation evidence, and adoption provenance remain reachable from a single Story.
- Adoption remains source-read-only until an approved apply operation, and Lore remains the sole writer of Lore-managed files.
- This Story does not change tracker selection, Quest package availability, or release state.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-330](../../.quest/tasks/LCLI-330.json) | Specify the Lore contract for adopting Backlog knowledge records | Done |
| [LCLI-331](../../.quest/tasks/LCLI-331.json) | Implement Backlog knowledge adoption through Lore public commands | Done |
<!-- lore:tasks:end -->

## Notes

The controlling public contract is the [Backlog knowledge adoption contract](../specs/backlog-knowledge-adoption-contract.md). Quest tracker work remains separately owned by the [tracker-backend integration Story](track-lore-cli-tracker-backend-integration.md).
