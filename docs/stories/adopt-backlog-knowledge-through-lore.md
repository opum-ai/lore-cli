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
timestamp: 2026-08-17T05:52:40.848Z
status: done
tasks:
  - lcli-330
  - lcli-331
---

# Adopt Backlog knowledge through Lore

## Goal

Keep the completed Backlog knowledge-adoption contract and its implementation
attached to one scoped ownership record. This Story covers the public
`lore backlog adopt` surface only; it neither selects Quest as Lore's tracker
default nor authorizes a product release.

## Acceptance criteria

- The documented command contract, implementation evidence, and adoption
  provenance remain reachable from a single Story.
- Adoption remains source-read-only until an approved apply operation, and
  Lore remains the sole writer of Lore-managed files.
- The Story does not imply that completing Backlog knowledge adoption changes
  tracker selection, package availability, or release state.

## Tasks

<!-- lore:tasks:begin -->
| Task | Title | Status |
|---|---|---|
| [LCLI-330](../../backlog/tasks/lcli-330%20-%20Specify-the-Lore-contract-for-adopting-Backlog-knowledge-records.md) | Specify the Lore contract for adopting Backlog knowledge records | Done |
| [LCLI-331](../../backlog/tasks/lcli-331%20-%20Implement-Backlog-knowledge-adoption-through-Lore-public-commands.md) | Implement Backlog knowledge adoption through Lore public commands | Done |
<!-- lore:tasks:end -->

## Notes

The controlling public contract is the
[Backlog knowledge adoption contract](../specs/backlog-knowledge-adoption-contract.md).
Quest-related tracker-default work belongs to the separate
[tracker-backend integration Story](track-lore-cli-tracker-backend-integration.md).
