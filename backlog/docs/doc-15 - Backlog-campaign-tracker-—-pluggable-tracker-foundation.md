---
id: doc-15
title: Backlog campaign tracker — pluggable tracker foundation
type: other
created_date: '2026-08-07 03:09'
updated_date: '2026-08-07 11:53'
---
# Backlog campaign tracker — pluggable tracker foundation

## Scope and order confirmation
- Scope: establish the pluggable-tracker foundation through LCLI-315.1, LCLI-315.2, and LCLI-315.3. LCLI-315.4 (Quest) and the LCLI-315 parent remain outside this campaign.
- Confirmed by the user: "confirmed" on 2026-08-06, accepting the proposed order LCLI-315.1, LCLI-315.2, LCLI-315.3.
- Rationale: build the backend-neutral construction and status-flow seam first; implement and qualify JIRA Cloud second; expose tracker selection in init only after every offered backend is reachable.
- Order is a tie-break; readiness and conflicts are recomputed live.
- Execution model: sequential waves of one task because the tasks conservatively overlap adapter, configuration, init, documentation, and test surfaces. No subagents are authorized.
- Authorization boundary: the user explicitly authorized pushing `feat/lcli-315-1-tracker-adapter-seam` to `git@github.com:opum-ai/lore-cli.git` and opening PR #337 against `dev`, including settlement updates on that same branch/PR. Merge, branch/worktree deletion, other PRs, and publication beyond PR #337 remain unauthorized.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-315.1 is Done in wave 1. Commits `ac237ed` and `49d494d` are delivered on PR #337 at head `49d494d6c7a1c328cf2f50af1b83b593501c4288`; the PR is open, non-draft, cleanly mergeable into `dev`, and all eight CI checks passed.
- LCLI-315.2 is To Do and its formal dependency LCLI-315.1 is now Done. It is next in campaign order, but safe execution from `dev` waits for PR #337 to merge or for explicit authorization to use a stacked branch because the required adapter seam is not yet on `dev`.
- LCLI-315.3 is To Do and its formal dependency LCLI-315.1 is now Done; campaign order still holds it behind LCLI-315.2 because init may offer only backends that are actually reachable.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-315.1 | Tracker adapter seam | none | Done; PR #337 open and green | 1 | `src/adapters/backlog.ts`, `src/adapters/tracker.ts`, `src/commands/link.ts`, `src/commands/export.ts`, `src/commands/reconcile-shared.ts`, `src/core/ladybug-source.ts`, tracker/reconcile tests, benchmark fake, `docs/reference/backlog-cli-contract.md` | All six ACs checked. Local focused tests, typecheck, lint, build, strict Lore gates, and diff hygiene passed; all eight clean-runner CI checks passed at head `49d494d`. |
| 2 | LCLI-315.2 | JIRA Cloud backend | LCLI-315.1 | To Do; formally unblocked; operationally waiting on PR #337 merge or stacked-branch authorization | — | tracker factory/interface, likely new JIRA adapter and tests, `src/config.ts`, reference documentation | Use REST v3 with mocked transport tests, environment-only credentials, explicit field-loss mapping, typed errors, and no silent retry. Docs changes must use Lore. |
| 3 | LCLI-315.3 | Init and tracker configuration | LCLI-315.1 | To Do; ordered after LCLI-315.2 by reachable-backend contract | — | `src/commands/init.ts`, `src/config.ts`, tracker factory/config types, init/config tests, `docs/adr/0017-interactive-init-wizard-tty-gated.md` if documentation changes are required | Preserve zero-config Backlog default, flag-implies-non-interactive behavior, TTY gates, JSON veto, and fail-loud validation. Docs changes must use Lore. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-315.1 | 2026-08-07 / wave 1 | Done with AC 1–6 checked. Delivered as commits `ac237ed` and `49d494d` on PR #337. Local focused verification and repository gates passed; GitHub Actions run 31175041234 passed all eight jobs, including Ubuntu and Windows full tests plus real-binary Docker E2E. PR remains open because merge was not authorized. |

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
- 2026-08-07 — restored against live Backlog and git state. The handover and task dependency claims matched; the only drift was CLI-created `doc-15` remaining untracked on the otherwise clean, synchronized checkout. Dispatched sequential wave 1 for LCLI-315.1 on `feat/lcli-315-1-tracker-adapter-seam`; delivery actions remained unauthorized.
- 2026-08-07 — settled wave 1 as retained in flight, not resolved. Implementation and adversarial self-review completed locally; 159 focused non-Ladybug tests passed with 0 failures, plus 27 focused tracker/reconcile tests, typecheck, lint (193 files), build, Lore dry-run sync, strict Lore validate/check, and diff hygiene. The full suite produced only Ladybug/indexed-retrieval deadline and temp-building cleanup failures while an unrelated repository sustained host CPU saturation; AC 6 remained unchecked.
- 2026-08-07 — after explicit authorization for `git@github.com:opum-ai/lore-cli.git`, pushed commits `ac237ed` and `49d494d` and opened PR #337 against `dev`. GitHub Actions run 31175041234 passed all eight jobs on the exact head `49d494d6c7a1c328cf2f50af1b83b593501c4288`, resolving the environmental test limitation. Checked AC 6, wrote the final summary, marked LCLI-315.1 Done, and retained merge plus later-wave remote mutations outside authorization.
