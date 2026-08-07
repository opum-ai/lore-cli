---
id: doc-15
title: Backlog campaign tracker — pluggable tracker foundation
type: other
created_date: '2026-08-07 03:09'
updated_date: '2026-08-07 05:35'
---
# Backlog campaign tracker — pluggable tracker foundation

## Scope and order confirmation
- Scope: establish the pluggable-tracker foundation through LCLI-315.1, LCLI-315.2, and LCLI-315.3. LCLI-315.4 (Quest) and the LCLI-315 parent remain outside this campaign.
- Confirmed by the user: "confirmed" on 2026-08-06, accepting the proposed order LCLI-315.1, LCLI-315.2, LCLI-315.3.
- Rationale: build the backend-neutral construction and status-flow seam first; implement and qualify JIRA Cloud second; expose tracker selection in init only after every offered backend is reachable.
- Order is a tie-break; readiness and conflicts are recomputed live.
- Execution model: sequential waves of one task because the tasks conservatively overlap adapter, configuration, init, documentation, and test surfaces. No subagents are authorized.
- Authorization boundary: the user's 2026-08-07 restore request authorizes sequential task dispatch plus local source/documentation implementation and verification for the restored campaign. Commit, push, PR, merge, branch/worktree deletion, publication, and other remote mutation remain unauthorized.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-315.1 remains In Progress in wave 1 on `feat/lcli-315-1-tracker-adapter-seam` at base `fcb799ea0e521010c4939008428d660808e63a11`. The implementation is present in the dirty worktree and AC 1–5 are checked. AC 6 is pending because the full suite is timing out under unrelated sustained host CPU saturation; commit/PR delivery also remains unauthorized.
- LCLI-315.2 is To Do and formally blocked by LCLI-315.1.
- LCLI-315.3 is To Do and formally blocked by LCLI-315.1; campaign order also holds it behind LCLI-315.2 because init may offer only backends that are actually reachable.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-315.1 | Tracker adapter seam | none | In Progress; locally implemented; AC 1–5 checked; AC 6 pending | 1 | `src/adapters/backlog.ts`, `src/adapters/tracker.ts`, `src/commands/link.ts`, `src/commands/export.ts`, `src/commands/reconcile-shared.ts`, `src/core/ladybug-source.ts`, tracker/reconcile tests, benchmark fake, `docs/reference/backlog-cli-contract.md` | Focused non-Ladybug verification, typecheck, lint, build, strict Lore gates, and diff hygiene pass. Full-suite Ladybug timeouts under external CPU saturation and missing delivery authority prevent settlement. |
| 2 | LCLI-315.2 | JIRA Cloud backend | LCLI-315.1 | Blocked; To Do | — | tracker factory/interface, likely new JIRA adapter and tests, `src/config.ts`, reference documentation | Use REST v3 with mocked transport tests, environment-only credentials, explicit field-loss mapping, typed errors, and no silent retry. Docs changes must use Lore. |
| 3 | LCLI-315.3 | Init and tracker configuration | LCLI-315.1 | Blocked; To Do; ordered after LCLI-315.2 by reachable-backend contract | — | `src/commands/init.ts`, `src/config.ts`, tracker factory/config types, init/config tests, `docs/adr/0017-interactive-init-wizard-tty-gated.md` if documentation changes are required | Preserve zero-config Backlog default, flag-implies-non-interactive behavior, TTY gates, JSON veto, and fail-loud validation. Docs changes must use Lore. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| — | — | No task has been resolved in this campaign. |

## Not queued — blocked, deferred, or human decision required
- LCLI-278: requires a material repository-admin, billing-plan, release-security, and control decision.
- LCLI-314: non-executable OKF 0.2 parent container; its executable subtasks are Done and completed tracker doc-13 must not be reopened.
- LCLI-315: parent container; executable work belongs to subtasks, and blocked LCLI-315.4 prevents parent completion.
- LCLI-315.4: outside scope and externally blocked. A direct public npm registry query on 2026-08-06 returned E404 for `@opum-ai/quest`; it also formally depends on LCLI-315.1.
- LCLI-42: explicitly on hold even though its formal dependencies are Done.
- LCLI-43: explicitly deferred even though its formal dependency is Done.
- LCLI-44: explicitly deferred and formally depends on LCLI-43.
- LCLI-45: explicitly deferred even though its formal dependency is Done.

## Wave log
- 2026-08-06 — initialized doc-15 after the user's explicit scope/order confirmation. Grounded against clean `dev` at `fcb799ea0e521010c4939008428d660808e63a11`, equal to locally known `origin/dev` at 0 behind / 0 ahead, with one registered worktree, no in-progress tasks, and no campaign branches. Direct npm registry inspection still returned E404 for `@opum-ai/quest`. No wave or delivery action was dispatched.
- 2026-08-07 — restored against live Backlog and git state. The handover and task dependency claims matched; the only drift was CLI-created `doc-15` remaining untracked on the otherwise clean, synchronized checkout. Dispatched sequential wave 1 for LCLI-315.1 on `feat/lcli-315-1-tracker-adapter-seam`; delivery actions remain unauthorized.
- 2026-08-07 — settled wave 1 as retained in flight, not resolved. Implementation and adversarial self-review completed locally; 159 focused non-Ladybug tests passed with 0 failures, plus 27 focused tracker/reconcile tests, typecheck, lint (193 files), build, Lore dry-run sync, strict Lore validate/check, and diff hygiene. The full suite produced only Ladybug/indexed-retrieval deadline and temp-building cleanup failures while an unrelated repository sustained host CPU saturation; AC 6 remains unchecked. Exact branch/base: `feat/lcli-315-1-tracker-adapter-seam` at `fcb799ea0e521010c4939008428d660808e63a11`; no commit or remote action was authorized.
