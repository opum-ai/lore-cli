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
| Lore-wide strategy, repository coordination, and Quest release ordering | [`opum-ai/opum-doc` Lore authority surface](https://github.com/opum-ai/opum-doc/blob/dev/docs/lore/index.md) | Link to the consolidated authority surface; do not reproduce its mutable gate |
| Product-family vocabulary, Opum SaaS, and commercial boundaries | [Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs) | Consume the ownership map and audit; do not promote component plans into product policy |
| Quest product and execution-graph semantics | [`opum-ai/opum-doc` Quest external routing and provenance](https://github.com/opum-ai/opum-doc/blob/dev/docs/quest/quest-external-routing-and-provenance.md) | Link when Lore integration requires it; do not maintain a second Quest contract |
| Quest CLI package, migration, implementation, and release | `opum-ai/quest-cli` | Treat its evidence as external owner state; `@opum-ai/quest@0.1.0` is publicly installable, while later versions or migration behavior require fresh owner evidence before Lore documents or consumes them |
| Peer-to-owner routing, session addressing, and canonical GitHub owners | [Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs) | Follow the owner route before answering a cross-repository question; do not maintain a second peer map |
| Infrastructure, DNS, hosting, deployment targets, environments, and secrets layout | `jeremy-newhouse/saws` | Record only this repository's local obligations and link to the owner; never create, modify, or delete a DNS record in any zone, for any provider, preview and ephemeral hostnames included |
| Historical Lore CLI task and campaign evidence | Live Backlog tasks plus tracked historical capsules in this repository | Preserve status and provenance, but remove executable old cursors |

GitHub owners are not uniform across the estate, and both CLI repositories'
former `salient-data` routes still redirect. A link that resolves is therefore
not evidence that a citation names the current owner, and neither is an
existence check: `gh api repos/<old-org>/<repo>` returns 200 through the
redirect. Read the owner back with `gh api repos/<owner>/<repo> --jq .full_name`
and compare it to the citation before trusting it.

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

The consolidated [Lore documentation namespace](https://github.com/opum-ai/opum-doc/tree/dev/docs/lore)
is the current product-authority route, and the
[Opum documentation hub](https://github.com/opum-ai/opum-doc/tree/dev/docs)
routes portfolio and other component authority.
The cross-product control record is the
[documentation authority audit](https://github.com/opum-ai/opum-doc/blob/dev/docs/reference/cross-product-documentation-authority-audit.md),
and the routing record is
[fleet peer routing and session invocation](https://github.com/opum-ai/opum-doc/blob/dev/docs/reference/fleet-peer-routing-and-session-invocation.md).
For active Lore-wide and Quest-wide policy, use the consolidated
[Lore authority surface](https://github.com/opum-ai/opum-doc/blob/dev/docs/lore/index.md)
and [Quest external routing and provenance](https://github.com/opum-ai/opum-doc/blob/dev/docs/quest/quest-external-routing-and-provenance.md)
records instead of routing directly to `lore-doc` or `quest-doc`.
Every repository named on this page is private, so each `github.com` link above
is access-gated rather than a destination: it returns 404 to anyone without
access. Treat such a link as a citation for a reader who can resolve it, confirm
access before relying on one, and never place one on a public surface, where it
is broken by construction.

A conflict between this repository and an owner record is drift, and drift is a
defect. This repository is authoritative for what Lore CLI currently ships; the
owner repository remains the normative owner of what the contract is. Do not
promote either side — neither quietly nor openly. Report the divergence to both
owners and leave the conflict standing until an owner resolves it.
