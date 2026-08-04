---
id: doc-10
title: Backlog campaign tracker — post-0.1.0 E2E regression coverage (round 8)
type: other
created_date: '2026-08-04 05:24'
updated_date: '2026-08-04 06:28'
---
# Backlog campaign tracker — post-0.1.0 E2E regression coverage (round 8)

## Scope and order confirmation
- Scope: Add persistent real-binary Docker E2E coverage for LCLI-298, LCLI-299, and LCLI-300.
- Confirmed by the user on 2026-08-04.
- Confirmed order: LCLI-298 → LCLI-299 → LCLI-300.
- Order is a tie-break; readiness and conflicts are recomputed live before every wave.
- Execution model: sequential single-task waves because all three tasks modify the shared Docker E2E harness.

## Frontier
Informational snapshot only; never a promised next wave.

- Resolved: LCLI-298 is Done and locally delivered in source commit `94cbd23`.
- Formally ready and dispatchable after settlement: LCLI-299. It is the next ordered task and has no formal dependency.
- Formally ready but ordered later: LCLI-300. Dependencies LCLI-261 and LCLI-262 are Done.
- In flight: none. No queued task will be dispatched until the current wave reconciliation is clean.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-298 | Docker E2E / agent initialization | LCLI-281 (Done) | Done | 1 | docker/e2e/run-e2e.sh; docker/e2e/Dockerfile | Delivered locally in `94cbd23`; full real-binary harness passed 316/316. |
| 2 | LCLI-299 | Docker E2E / validation and schema | none | To Do; ready and next ordered | — | docker/e2e/run-e2e.sh | Cover validate --type and schema export --type/--out. |
| 3 | LCLI-300 | Docker E2E / regression backports | LCLI-261 (Done), LCLI-262 (Done) | To Do; ready after LCLI-299 | — | docker/e2e/run-e2e.sh | Persist orphan hierarchy and rewrite-link text-mismatch regressions. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-298 | 2026-08-04 / wave 1 | Done and locally delivered as `94cbd23`. Docker E2E passed 316/316; `bun test`, typecheck, lint, `bash -n`, and diff hygiene passed. No remote mutation occurred. |
| Pre-campaign LCLI-297/LCLI-301 residue | 2026-08-04 / cleanup | Verified and committed locally as `10ecee2`. Verification passed 2,434 tests, typecheck, lint, actionlint, strict Lore validation/check, focused patch/package tests, and staged diff hygiene. No remote mutation occurred. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material billing, visibility, security-control, and repository-administration decision plus remote configuration.
- LCLI-42: on hold and unscheduled; dependencies are Done, but explicit reactivation is required.
- LCLI-43: deferred; dependency LCLI-28 is Done, but no reactivation decision exists.
- LCLI-44: deferred and formally blocked by non-terminal LCLI-43.
- LCLI-45: deferred despite completed dependency LCLI-9; its notes require a concrete in-process import need.
- LCLI-297 and LCLI-301: Done in local commit `10ecee2` and outside this campaign queue.

## Wave log
- 2026-08-04 — wave 1 local delivery: explicit local commit authority was granted. Committed the verified LCLI-298 source scope as `94cbd23`, marked all five acceptance criteria and the task Done, and opened the post-wave frontier for LCLI-299. No push, PR, merge, publication, or remote mutation occurred.
- 2026-08-04 — wave 1 verification: implemented real-binary Codex/Claude bridge coverage and the missing Docker image patch copy. Docker E2E passed 316/316; repository tests, typecheck, lint, shell parse, and diff hygiene passed; adversarial self-review found no blocker.
- 2026-08-04 — wave 1 dispatch: grounded `dev` at `0b5f508`, 0 behind / 9 ahead of locally known `origin/dev`, one worktree, all three queued tasks formally ready, and dispatched only LCLI-298 because every task shares `docker/e2e/run-e2e.sh`.
- 2026-08-04 — cleanup settlement: committed verified pre-campaign LCLI-297/LCLI-301 work locally as `10ecee2`; no queued task was dispatched and no remote mutation occurred.
- 2026-08-04 — init: inventoried live non-terminal tasks, confirmed the sequential queue, and created tracker doc-10 without source or remote mutations.
