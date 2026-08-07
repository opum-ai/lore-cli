---
id: doc-15
title: Backlog campaign tracker — pluggable tracker foundation
type: other
created_date: '2026-08-07 03:09'
updated_date: '2026-08-07 13:40'
---
# Backlog campaign tracker — pluggable tracker foundation

## Scope and order confirmation
- Scope: establish the pluggable-tracker foundation through LCLI-315.1, LCLI-315.2, and LCLI-315.3. LCLI-315.4 (Quest) and the LCLI-315 parent remain outside this campaign.
- Confirmed by the user: "confirmed" on 2026-08-06, accepting the proposed order LCLI-315.1, LCLI-315.2, LCLI-315.3.
- Rationale: build the backend-neutral construction and status-flow seam first; implement and qualify JIRA Cloud second; expose tracker selection in init only after every offered backend is reachable.
- Order is a tie-break; readiness and conflicts are recomputed live.
- Execution model: sequential waves of one task because the tasks conservatively overlap adapter, configuration, init, documentation, and test surfaces. No subagents are authorized.
- Authorization boundary: the user authorized LCLI-315.2 implementation and normal branch/commit/push/PR delivery on 2026-08-07. Merge, branch/worktree deletion, publication, LCLI-315.3 execution, and unrelated remote mutation remain unauthorized.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-315.1 is Done and integrated into `dev` through PR #337 as merge commit `2783fc9622543e6a192f35fa14b4e8669e9b0b56`. Exact-head CI run 31177004750 passed all eight jobs before merge. Verified local and remote branch `feat/lcli-315-1-tracker-adapter-seam` refs were pruned after ancestry confirmation.
- LCLI-315.2 is Done locally on `feat/lcli-315-2-jira-cloud-adapter`, based at `8dd9d8e4dde2cf3895a0a8d6720cad26d7d5fe83`. All nine ACs are checked after mocked full-interface tests, full repository gates, and disposable live qualification in Jira project JT. Commit, push, and PR delivery are the remaining authorized actions; merge and cleanup remain gated.
- LCLI-315.3 is To Do and its formal dependency LCLI-315.1 is now Done; campaign order still holds it behind LCLI-315.2 because init may offer only backends that are actually reachable.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-315.1 | Tracker adapter seam | none | Done; merged through PR #337; branch pruned | 1 | `src/adapters/backlog.ts`, `src/adapters/tracker.ts`, `src/commands/link.ts`, `src/commands/export.ts`, `src/commands/reconcile-shared.ts`, `src/core/ladybug-source.ts`, tracker/reconcile tests, benchmark fake, `docs/reference/backlog-cli-contract.md` | All six ACs checked. Local focused tests, typecheck, lint, build, strict Lore gates, and diff hygiene passed; all eight clean-runner CI checks passed at head `49d494d`. |
| 2 | LCLI-315.2 | JIRA Cloud backend | LCLI-315.1 | Done locally; PR delivery pending | 2 | `src/adapters/jira.ts`, tracker factory, `src/config.ts`, scaffold/config/tracker tests, `docs/reference/backlog-cli-contract.md` | Shells installed `@salient-ai/jira-cli`; jira-cli owns credentials, HTTP, timeouts, and ADF. All nine ACs checked; full tests, typecheck, lint, build, strict Lore gates, diff hygiene, and disposable JT live qualification passed. |
| 3 | LCLI-315.3 | Init and tracker configuration | LCLI-315.1 | To Do; ordered after LCLI-315.2 by reachable-backend contract | — | `src/commands/init.ts`, `src/config.ts`, tracker factory/config types, init/config tests, `docs/adr/0017-interactive-init-wizard-tty-gated.md` if documentation changes are required | Preserve zero-config Backlog default, flag-implies-non-interactive behavior, TTY gates, JSON veto, and fail-loud validation. Docs changes must use Lore. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-315.1 | 2026-08-07 / wave 1 | Done with AC 1–6 checked. Delivered through PR #337 and merged into `dev` as `2783fc9622543e6a192f35fa14b4e8669e9b0b56`; exact final-head run 31177004750 passed all eight jobs, including Ubuntu and Windows full tests plus real-binary Docker E2E. Verified merged ancestry before pruning exact local and remote feature-branch refs. |
| LCLI-315.2 | 2026-08-07 / wave 2 | Done locally with AC 1–9 checked. User superseded direct REST with installed jira-cli ownership. Mocked subprocess coverage exercises the full adapter and typed failures; full local gates passed. Live JT-2 exercised create/read/update/comment/transition/invalid-priority/delete/404, and JT-3 proved exact managed Markdown/JSON round-trip through ADF; both disposable issues were deleted. PR delivery remains pending. |

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
- 2026-08-07 — after explicit authorization for `git@github.com:opum-ai/lore-cli.git`, pushed commits `ac237ed` and `49d494d` and opened PR #337 against `dev`. GitHub Actions run 31175041234 passed all eight jobs on the exact implementation head `49d494d6c7a1c328cf2f50af1b83b593501c4288`, resolving the environmental test limitation. Checked AC 6, wrote the final summary, marked LCLI-315.1 Done, and pushed the Backlog/Lore settlement on the same PR. Refreshed run 31176258770 also passed all eight jobs.
- 2026-08-07 — merged PR #337 at exact audited head `a245bfee147517bb5fbe172e2f47b667367604df` into `dev` as `2783fc9622543e6a192f35fa14b4e8669e9b0b56` after all eight checks passed in run 31177004750. Fetched and synchronized `dev`, proved merged ancestry, deleted exact local and remote `feat/lcli-315-1-tracker-adapter-seam` refs, and retained one clean primary worktree. The user authorized this small follow-up tracker reconciliation; no next-task execution was authorized.
- 2026-08-07 — user authorized LCLI-315.2 implementation and normal PR delivery. Re-grounded clean `dev` at `8dd9d8e4dde2cf3895a0a8d6720cad26d7d5fe83`, equal to `origin/dev`, with one worktree and LCLI-315.1 Done. Dispatched sequential wave 2 on `feat/lcli-315-2-jira-cloud-adapter`; merge and cleanup remain unauthorized.
- 2026-08-07 — completed wave 2 implementation after the user clarified that installed `@salient-ai/jira-cli`, initialized in the project, must own credentials and Jira transport. Marked LCLI-315.2 Done with all nine ACs checked after 73 focused tests, the full test suite, typecheck, lint, build, Lore sync and strict validate/check, and diff hygiene. Disposable JT-2 and JT-3 live qualifications passed and were deleted. Branch delivery through commit/push/PR is authorized; merge, pruning, and LCLI-315.3 execution remain unauthorized.
