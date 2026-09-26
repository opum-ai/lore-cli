---
type: Constitution
title: Fixture constitution
summary: The sample bundle's durable principles and how they change.
timestamp: 2026-06-21T00:00:00Z
version: 1.0.0
ratified: "2026-06-21"
last_amended: "2026-06-21"
amendment_authority: fixture maintainers
---

# Fixture constitution

## Principles

### P1. Concepts are typed

Every concept in the bundle MUST carry a `type`; see the [glossary](../reference/glossary.md).

Rationale: an untyped file is not an OKF concept, so no tool can reason about it.

Check: `lore validate` rejects a concept without a `type`.

## Governance

Amendments are agent-drafted and human-ratified by pull request, each linked to an ADR.

## Amendment log

| Version | Date | Change |
|---|---|---|
| 1.0.0 | 2026-06-21 | Initial ratification. |
