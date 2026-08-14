---
id: doc-20
title: Backlog campaign tracker — LCLI-330 missing-task reconciliation
type: other
created_date: '2026-08-14 23:05'
updated_date: '2026-08-14 23:10'
---
# Backlog campaign — LCLI-330 Backlog knowledge adoption contract
## Contract
- Mode: autonomous-docs
- Scope: lore-cli only; LCLI-330 and directly unlocked in-scope documentation work
- Queue rule: dependencies, then priority and ordinal
- Governing authorization: explicit `$backlog-handover init | LCLI-330`; delivery to `dev` under repository AGENTS authority
## Repository
| Repository | Task ids | AGENTS authority | Integration base | Required gates |
| --- | --- | --- | --- | --- |
| lore-cli | LCLI-330 | autonomous docs/repository process; `dev` only | `2ba7504e0b1d2134ff18e5cc053af991fc4ab3c9` | Lore preflight for self-committing operations; strict validation/check; diff check; independent review |
## Frontier
- Resolved: 0; in flight: 1; blocked: 0; ready: 0. LCLI-330 is authoring the approved Backlog-specific contract and blocks LCLI-331.
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-330 | none | in progress | 1 | docs/specs/backlog-knowledge-adoption-contract.md, docs/reference |
| 2 | LCLI-331 | LCLI-330 | blocked | later | src/commands, src/core, tests |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |
## Human decisions and blockers
- Resolved 2026-08-14: the public namespace is `lore backlog adopt` with `preview`, `apply`, `status`, and `rollback`; preview emits a versioned approval receipt and apply requires its exact digest.
## Wave log
- Initialized 2026-08-14 against remote `dev` SHA `2ba7504e0b1d2134ff18e5cc053af991fc4ab3c9`; remote tracking ref was fast-forwarded from `4540f52d5842cf8953c79090062047688687b2cd` before queue derivation.
- LCLI-330 activated, planned, and scaffolded `docs/specs/backlog-knowledge-adoption-contract.md`.
- Human contract decision resolved; authoring resumed.
