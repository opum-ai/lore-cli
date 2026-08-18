---
id: doc-24
title: Backlog campaign — Lore documentation integrity 2026-08-18
type: other
created_date: '2026-08-18 13:07'
updated_date: '2026-08-18 13:17'
---
# Backlog campaign — Lore documentation integrity 2026-08-18

## Contract
- Mode: autonomous-docs
- Scope: lore-cli only
- Governing authorization: explicit `$backlog-handover init` on 2026-08-18
- Queue rule: dependencies, then priority and ordinal
- Integration destination: `dev`; no `dev` to `main` promotion or publication

## Repository
| Repository | Task ids | AGENTS authority | Integration base | Required gates |
| --- | --- | --- | --- | --- |
| lore-cli | LCLI-326 | autonomous docs and repository-process campaign | `dev` at `c3ff8d2351ad41daa59f9cdc27e6372b4330a2ff` | focused/full tests, lint, typecheck, build as affected, `lore sync`, strict Lore validation/check, diff hygiene, independent review, PR checks |

## Frontier
- Ready: 0; in flight: 1; blocked: 0; resolved: 0.
- LCLI-326 is independently approved and integrated on the wave branch; coordinator regeneration and cumulative gates are next.

## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-326 | none | in flight | 1 | `src/core/log.ts`, log/sync tests, CLI contract, coordinator-owned `docs/log.md` |

## Resolved
| Task | Wave | Disposition | Evidence pointer |
| --- | --- | --- | --- |

## Human decisions and blockers
- LCLI-278 requires repository administration and security-owner action.
- LCLI-333 requires dependencies plus separately authorized publication.
- LCLI-336 requires `dev` to `main` promotion and release actions outside this campaign.
- LCLI-315 is a parent container whose children own implementation; LCLI-315.4 and doc-23 are settled.
- LCLI-339 and LCLI-340 are product-code tasks outside this documentation/process queue.
- LCLI-42 through LCLI-45 are deferred or on hold.
- A read-only Quest handback prompt will be returned from completed LCLI-315.4 and audited doc-23 evidence; no Quest repository mutation is authorized.

## Wave log
- Init grounded clean `dev` worktree at `c3ff8d2351ad41daa59f9cdc27e6372b4330a2ff`.
- Wave 1 lease: Treehouse `b02db5efb7d595bfe4c487054b90cbee`, holder `lcli-326-writer`, branch `fix/lcli-326-log-reprojection`, pinned base `c3ff8d2351ad41daa59f9cdc27e6372b4330a2ff`; command-scoped HTTPS transport.
- First review rejected test-only head `11cc32d`: production repeated multi-folder commits. Corrected head `5605f87` assigns each commit once to its deepest common folder.
- Independent re-review approved `5605f87`: replay 251 entries, 251 unique docs commit identities, zero duplicates; 61 focused tests, typecheck, and diff hygiene passed.
- Reviewed commits integrated on `campaign/lcli-326-doc-integrity` at `422f8b9`.
- Preserved pre-existing unique ODoc branches/worktrees and the LCLI-315.4 recovery branch; they were not created by this campaign and are not cleanup candidates.
