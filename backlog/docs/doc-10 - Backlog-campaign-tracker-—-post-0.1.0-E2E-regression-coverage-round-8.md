---
id: doc-10
title: Backlog campaign tracker — post-0.1.0 E2E regression coverage (round 8)
type: other
created_date: '2026-08-04 05:24'
updated_date: '2026-08-04 06:50'
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

- Resolved: LCLI-298 and LCLI-299 are Done and locally delivered.
- Formally ready after settlement: LCLI-300. Dependencies LCLI-261 and LCLI-262 are Done.
- In flight: none. LCLI-300 will not be dispatched until readiness and conflicts are recomputed in a new wave.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-298 | Docker E2E / agent initialization | LCLI-281 (Done) | Done | 1 | docker/e2e/run-e2e.sh; docker/e2e/Dockerfile | Delivered locally in `94cbd23`; full real-binary harness passed 316/316. |
| 2 | LCLI-299 | Docker E2E / validation and schema | none | Done | 2 | docker/e2e/run-e2e.sh | Delivered locally in `106219c`; full real-binary harness passed 329/329. |
| 3 | LCLI-300 | Docker E2E / regression backports | LCLI-261 (Done), LCLI-262 (Done) | To Do; ready and next ordered | — | docker/e2e/run-e2e.sh | Persist orphan hierarchy and rewrite-link text-mismatch regressions. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-299 | 2026-08-04 / wave 2 | Done and locally delivered as `106219c`; Backlog reconciliation `3c85ade`; documentation synchronization `187ed8a`. Docker E2E passed 329/329; 2,434 tests, typecheck, lint, `bash -n`, diff hygiene, and adversarial self-review passed. No remote mutation occurred. |
| LCLI-298 | 2026-08-04 / wave 1 | Done and locally delivered as `94cbd23`; Backlog reconciliation `b020ddc`; documentation synchronization `744c7a4`; tracker reconciliation `3f260d3`. Docker E2E passed 316/316; `bun test`, typecheck, lint, `bash -n`, and diff hygiene passed. No remote mutation occurred. |
| Pre-campaign LCLI-297/LCLI-301 residue | 2026-08-04 / cleanup | Verified and committed locally as `10ecee2`. Verification passed 2,434 tests, typecheck, lint, actionlint, strict Lore validation/check, focused patch/package tests, and staged diff hygiene. No remote mutation occurred. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material billing, visibility, security-control, and repository-administration decision plus remote configuration.
- LCLI-42: on hold and unscheduled; dependencies are Done, but explicit reactivation is required.
- LCLI-43: deferred; dependency LCLI-28 is Done, but no reactivation decision exists.
- LCLI-44: deferred and formally blocked by non-terminal LCLI-43.
- LCLI-45: deferred despite completed dependency LCLI-9; its notes require a concrete in-process import need.
- LCLI-297 and LCLI-301: Done in local commit `10ecee2` and outside this campaign queue.

## Wave log
- 2026-08-04 — wave 2 delivery settlement: source `106219c`, Backlog reconciliation `3c85ade`, and generated documentation `187ed8a` completed locally. The final tracker-only reconciliation records these immutable SHAs without regenerating docs. LCLI-300 remains undispatched and is the next candidate after a fresh live recomputation.
- 2026-08-04 — wave 2 verification: the rebuilt real-binary harness passed 329/329, the repository suite passed 2,434/2,434, typecheck/lint/shell parse/diff hygiene passed, all four criteria were checked, and adversarial self-review found no blocker. No remote mutation occurred.
- 2026-08-04 — wave 2 dispatch: explicit approval to proceed restored a clean `dev` at `3f260d30943d0ce27b0688077b8a0bec42a3bfb5`, 0 behind / 13 ahead of locally known `origin/dev`, one worktree, LCLI-299 To Do with no dependencies, and LCLI-300 formally ready with both dependencies Done. Dispatched only LCLI-299 because both remaining tasks share `docker/e2e/run-e2e.sh`; local task delivery commits and Lore reconciliation were authorized, but no remote action was authorized.
- 2026-08-04 — wave 1 settlement: source commit `94cbd23`, Backlog reconciliation `b020ddc`, generated documentation commit `744c7a4`, and tracker-only reconciliation `3f260d3` completed locally. LCLI-299 became the next safe ordered task.
- 2026-08-04 — wave 1 verification: Docker E2E passed 316/316; repository tests, typecheck, lint, shell parse, and diff hygiene passed; adversarial self-review found no blocker.
- 2026-08-04 — wave 1 dispatch: grounded `dev` at `0b5f508`, 0 behind / 9 ahead of locally known `origin/dev`, one worktree, and dispatched only LCLI-298 because every queued task shares `docker/e2e/run-e2e.sh`.
- 2026-08-04 — cleanup settlement: committed verified pre-campaign LCLI-297/LCLI-301 work locally as `10ecee2`; no queued task was dispatched and no remote mutation occurred.
- 2026-08-04 — init: inventoried live non-terminal tasks, confirmed the sequential queue, and created tracker doc-10 without source or remote mutations.
