---
id: doc-14
title: Backlog campaign tracker — post-0.1.1 runtime and init reliability
type: other
created_date: '2026-08-05 22:13'
updated_date: '2026-08-05 22:49'
---
# Backlog campaign tracker — post-0.1.1 runtime and init reliability

## Scope and order confirmation
- Scope: resolve the three post-0.1.1 defects LCLI-319, LCLI-317, and LCLI-318.
- Confirmed by the user: "confirmed" on 2026-08-05, accepting the proposed order LCLI-319, LCLI-317, LCLI-318.
- Rationale: start with the localized, source-confirmed init diagnostic defect; then isolate the native-runtime reliability split before addressing the workspace validation defect that formally depends on it.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential waves of one task; no subagents. Initialization authorized the tracker and ignored handover only; the 2026-08-05 restore invocation authorized continuation through the next safe task wave.
- Delivery authorization: on 2026-08-05 the user approved creating a local feature branch and committing the five LCLI-319 campaign paths. Push, PR, merge, branch deletion, and publication remain unauthorized.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-319 remains In Progress with both acceptance criteria verified and is retained on local branch `fix/lcli-319-backlog-init-diagnostic` pending integration authority.
- LCLI-317 is otherwise live-ready but remains undispatched while LCLI-319 delivery is incomplete.
- LCLI-318 remains blocked by its formal dependency on LCLI-317.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-319 | Backlog capability diagnostics | none | In Progress; AC verified; local feature branch pending integration | 1 | `src/adapters/backlog.ts`, `test/backlog-probe.test.ts`, `test/init.test.ts` | Focused and full gates passed. Retained on `fix/lcli-319-backlog-init-diagnostic` from base `b0523be9b5fdbc49f8440964d61ca2ef084bb11d`; local commit authorized, remote delivery not authorized. |
| 2 | LCLI-317 | Native Ladybug runtime reliability | none | To Do; ready, undispatched; prior-wave delivery blocked | — | `src/core/ladybug-native.ts`, `src/core/ladybug-lifecycle.ts`, `src/core/retrieval.ts`, `src/core/workspace-retrieval.ts`, Ladybug and indexed-retrieval tests | Controlled repro must isolate volume boundary and concurrency independently before choosing a fix. Do not dispatch while LCLI-319 remains undelivered. |
| 3 | LCLI-318 | Workspace validation ordering | LCLI-317 | To Do; dependency-blocked | — | `src/core/workspace-projection.ts`, `src/core/workspace-source.ts`, `src/core/workspace-retrieval.ts`, `test/workspace-retrieval.test.ts` | Shares workspace/native retrieval surfaces with LCLI-317 and cannot dispatch until that task is Done. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| — | — | No campaign task is terminal yet; LCLI-319 is verified and retained on a local feature branch until integration is authorized. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: repository-admin, billing-plan, and release-security decision. Live GitHub inspection on 2026-08-05 still shows no protection rules, no deployment branch policy, and administrator bypass enabled.
- LCLI-314: non-executable OKF 0.2 parent container; its six executable subtasks are already Done and the completed doc-13 campaign must not be reopened.
- LCLI-315: parent container for a separate pluggable-tracker initiative.
- LCLI-315.1: agent-resolvable now but excluded from this confirmed campaign; it is a larger product seam and conservatively overlaps LCLI-319 in `src/adapters/backlog.ts`.
- LCLI-315.2 and LCLI-315.3: outside scope and formally blocked by LCLI-315.1.
- LCLI-315.4: externally blocked; a direct public-registry check on 2026-08-05 still returned npm E404 for `@opum-ai/quest`.
- LCLI-42: explicitly on hold.
- LCLI-43, LCLI-44, and LCLI-45: explicitly deferred; LCLI-44 also depends on LCLI-43.

## Wave log
- 2026-08-05 — initialized doc-14 after explicit scope/order confirmation. Grounded against clean `dev` at `b0523be9b5fdbc49f8440964d61ca2ef084bb11d`, equal to locally known `origin/dev` at 0 behind / 0 ahead, with one registered worktree and no campaign branches. Live task reads confirm LCLI-319 and LCLI-317 ready, with LCLI-318 blocked on LCLI-317. No wave or delivery action was dispatched.
- 2026-08-05 — restore reconciliation found no task, branch, worktree, dependency, or SHA drift. The sole repo-visible path is the expected untracked doc-14 tracker, disjoint from LCLI-319 source/test scope. Dispatched LCLI-319 as sequential wave 1; all delivery actions remain unauthorized.
- 2026-08-05 — settled wave 1 at verified local-only state. LCLI-319 now distinguishes an uninitialized Backlog.md project from genuine JSON incapability, and exact legacy warning/hint behavior is pinned. Evidence: focused tests 86/86; typecheck passed; lint checked 191 files; full suite 2,526 passed, 1 skipped, 0 failed; real installed Backlog probe from `/private/tmp` returned the new `backlog init` guidance; `git diff --check` passed. Adversarial self-review found no unresolved acceptance gap. Task remains In Progress and artifacts remain on `dev` because commit/push/PR/merge authority is absent; LCLI-317 was not dispatched over the dirty checkout.
- 2026-08-05 — delivery authorization follow-up: the user approved a local feature branch and local commit for the five LCLI-319 campaign paths. Work moved from `dev` to `fix/lcli-319-backlog-init-diagnostic`; task remains In Progress pending integration. Push, PR, merge, deletion, and publication remain unauthorized. The resulting local commit SHA is recorded in the ignored active handover because it cannot be known until this tracker is committed.
