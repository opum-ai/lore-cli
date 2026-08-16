---
id: doc-20
title: Backlog campaign tracker — LCLI-330 missing-task reconciliation
type: other
created_date: '2026-08-14 23:05'
updated_date: '2026-08-14 23:18'
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
| lore-cli | LCLI-330 | autonomous docs/repository process; `dev` only | `302d307340bed18bacc400a7e719e24a82b93cc1` | Lore preflight for self-committing operations; strict validation/check; diff check; independent PR CI |
## Frontier
- Resolved: 1; in flight: 0; blocked: 0; ready: 0. The requested LCLI-330 documentation scope is complete.
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-330 | none | settled | 1 | delivered in PR #379 |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |
| LCLI-330 | 1 | Merged to `dev` and settled | PR #379, merge `302d307340bed18bacc400a7e719e24a82b93cc1`; strict Lore gates and all PR CI checks passed |
## Human decisions and blockers
- Resolved 2026-08-14: the public namespace is `lore backlog adopt` with `preview`, `apply`, `status`, and `rollback`; preview emits a versioned approval receipt and apply requires its exact digest.
## Wave log
- Initialized 2026-08-14 against remote `dev` SHA `2ba7504e0b1d2134ff18e5cc053af991fc4ab3c9`; remote tracking ref was fast-forwarded from `4540f52d5842cf8953c79090062047688687b2cd` before queue derivation.
- LCLI-330 activated, planned, and authored after the human contract decision.
- PR #379 merged at `302d307340bed18bacc400a7e719e24a82b93cc1`; all eight CI checks and merged-tree strict Lore gates passed.
- Settlement metadata pending the guarded Lore sync commit and final delivery.
