---
# yaml-language-server: $schema=../../.lore/schemas/adr.schema.json
type: ADR
title: Separate OKF lifecycle from Lore task progress
summary: Defines distinct lifecycle and task-progress semantics for OKF 0.2 while preserving OKF 0.1 compatibility.
timestamp: 2026-08-05T15:21:33.241Z
---

# Separate OKF lifecycle from Lore task progress

## Status

Accepted

## Context

OKF 0.2 defines `status` as the knowledge lifecycle: `draft`, `stable`, or `deprecated`. Lore already used `status` for a different purpose: a rollup of linked Backlog task progress such as `todo`, `in-progress`, or `done`. Reusing one field for both meanings would make files ambiguous and could silently turn project progress into a claim about knowledge quality.

OKF 0.1 bundles predate this collision and already depend on the historical Lore behavior. Compatibility therefore needs to be selected by the bundle version instead of rewriting existing files.

OKF 0.2 also adds `verified`, `stale_after`, and actor identifiers. These fields need a clear validation and warning policy that does not overstate what Lore can prove.

## Decision

Lore treats lifecycle and task progress as separate facts.

- In OKF 0.2, `status` is only the OKF lifecycle vocabulary: `draft`, `stable`, or `deprecated`. An absent lifecycle status retains the OKF default meaning of stable; Lore does not stamp it merely to make the default explicit.
- In OKF 0.2, Lore writes and checks its derived Backlog task rollup in `lore_task_status`: `todo`, `in-progress`, or `done`.
- In OKF 0.1, Lore keeps the existing task rollup in `status` for byte and behavior compatibility.
- Version selection chooses the field. Lore never translates or coerces a lifecycle value into task progress, or task progress into lifecycle state.
- Superseding an OKF 0.2 concept records `superseded_by` and changes lifecycle `status` to `deprecated`. OKF 0.1 retains the historical `status: superseded` behavior.

Lore validates the OKF 0.2 trust and lifecycle family as follows:

- `verified` accepts one verification event or a list of events. Every event must contain an actor-shaped `by` and an ISO-8601 `at` time. This validates evidence syntax only; Lore does not authenticate the actor or prove the verification happened.
- Actors are accepted consistently as `producer/version`, `human:<id>`, or `process:<id>` in generated provenance, source authorship, and verification evidence.
- `stale_after` is an absolute `YYYY-MM-DD` date. On that UTC calendar date and afterward, `lore check` emits a warning. The default check remains successful; `--strict` promotes the warning to a failing gate.

The runtime validators and generated editor schemas share these vocabularies and shapes.

## Consequences

The two meanings can evolve independently and no automation can accidentally reinterpret delivery progress as knowledge maturity. Existing OKF 0.1 bundles remain compatible, while new OKF 0.2 bundles are unambiguous.

Consumers that display Lore task progress from OKF 0.2 must read `lore_task_status`; consumers interested only in standard OKF lifecycle can ignore that producer extension. Migrating a 0.1 bundle is an explicit operation because moving task progress out of `status` requires knowing which historical values are rollups rather than lifecycle claims.

A `verified` entry is useful provenance evidence, not an identity guarantee. A staleness warning asks for review but does not mutate lifecycle, verification, or task progress.

This decision refines the version-negotiation and reconciliation rules in [ADR-0009](./0009-story-task-coupling-reconciliation.md) and is documented for consumers in [OKF conformance](../reference/okf-conformance.md).
