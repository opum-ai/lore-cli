---
type: Reference
title: Lore CLI documentation ownership
tags:
  - documentation
  - ownership
  - authority
  - routing
summary: Route component documentation, release evidence, historical provenance, and cross-repository policy to their sole owners.
timestamp: 2026-08-03T16:05:16.605Z
---

# Lore CLI documentation ownership

The canonical owner repository is `opum-ai/lore-cli`. Lore CLI owns its
implementation, package, command behavior, tests,
publication workflow, and immutable component release evidence. It consumes
Lore-wide and product-family policy from their owner repositories instead of
copying mutable cross-repository contracts.

## Details

| Concern | Sole owner | Local treatment |
| --- | --- | --- |
| Lore CLI command, package, tests, local graph, and release artifacts | `opum-ai/lore-cli` (this repository) | ADRs, Specs, References, Runbooks, Stories, and live Backlog evidence |
| Lore-wide strategy, repository coordination, and Quest release ordering | `salient-data/lore-doc` | Link to the owner record; do not reproduce its mutable gate |
| Product-family vocabulary, Opum SaaS, and commercial boundaries | `salient-data/opum-doc` | Consume the ownership map and audit; do not promote component plans into product policy |
| Quest product and execution-graph semantics | `salient-data/quest-doc` | Link when Lore integration requires it; do not maintain a second Quest contract |
| Quest CLI package, migration, implementation, and release | `salient-data/quest-cli` | Treat its evidence as external owner state |
| Historical Lore CLI task and campaign evidence | Live Backlog tasks plus tracked historical capsules in this repository | Preserve status and provenance, but remove executable old cursors |

### Local lifecycle

- [Maintain Lore CLI documentation authority](../stories/maintain-lore-cli-documentation-authority.md)
  owns documentation truth and coupling work.
- [Prepare the first Lore CLI release](../stories/prepare-the-first-lore-cli-release.md)
  owns release readiness and unresolved owner gates.
- [Lore CLI release truth](lore-cli-release-truth.md) is the current
  availability record.
- [Lore CLI handover](../runbooks/lore-cli-handover.md) is the only current
  handover. It routes to live evidence and does not carry a task cursor.
- Files named `historical-*` and files under `archive/handovers/` are immutable
  provenance capsules. They are not instructions, queues, or authorization.

The cross-product control record is the
[documentation authority audit](https://github.com/salient-data/opum-doc/blob/dev/docs/reference/cross-product-documentation-authority-audit.md).
If that audit conflicts with a current owner-local contract, the owner-local
contract controls and the audit should be corrected.
