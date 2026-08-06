---
id: doc-14
title: Backlog campaign tracker — post-0.1.1 runtime and init reliability
type: other
created_date: '2026-08-05 22:13'
updated_date: '2026-08-06 01:29'
---
# Backlog campaign tracker — post-0.1.1 runtime and init reliability

## Scope and order confirmation
- Scope: resolve the three post-0.1.1 defects LCLI-319, LCLI-317, and LCLI-318.
- Confirmed by the user: "confirmed" on 2026-08-05, accepting the proposed order LCLI-319, LCLI-317, LCLI-318.
- Rationale: start with the localized, source-confirmed init diagnostic defect; then isolate the native-runtime reliability split before addressing the workspace validation defect that formally depends on it.
- Order is a tie-break; readiness is recomputed live.
- Execution model: sequential waves of one task; no subagents. Initialization authorized the tracker and ignored handover only; the 2026-08-05 restore invocation authorized continuation through the next safe task wave.
- Delivery authorization: the user separately authorized the LCLI-319 local commit, push/PR, merge, post-merge tracked reconciliation PR, and pruning of its merged implementation branch. The 2026-08-05 restore invocation authorized LCLI-317 execution as wave 2; the 2026-08-06 follow-up authorizes one local commit of its four tracked campaign paths. Push, PR, merge, branch deletion, publication, LCLI-318 dispatch, and unrelated cleanup remain unauthorized.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-319 is Done and durably settled through PR #330, exact settlement head `6fd1e8dc13031c2a3a7cd77396aa894b6293521d`, merged into `origin/dev` as `f03b52808f3a35f033a44205e58a9b9a680b1c16`.
- LCLI-317 is acceptance-verified on `fix/lcli-317-indexed-preflight-advisory`; local commit authorization is recorded, but push, PR, and merge remain unauthorized, so it stays In Progress pending integration.
- LCLI-318 remains blocked by its formal dependency on LCLI-317; no task is ready for dispatch while wave 2 awaits delivery disposition.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-319 | Backlog capability diagnostics | none | Done; implementation and tracker settlement integrated | 1 | `src/adapters/backlog.ts`, `test/backlog-probe.test.ts`, `test/init.test.ts` | Implementation commit `620ced12fbcaa5b504c9b4206913a781b3042bc1`; exact implementation PR head `fffd90a29e87df86a0b40e1d45921a4bc2d887fd`; PR #329 merged into `dev` as `d3193d725b2df6dd3c20c01da9e3f35ec26cf5d4`; settlement PR #330 exact head `6fd1e8dc13031c2a3a7cd77396aa894b6293521d` merged as `f03b52808f3a35f033a44205e58a9b9a680b1c16`. |
| 2 | LCLI-317 | Native Ladybug runtime reliability | none | In Progress; acceptance-verified; local-only delivery authorized | 2 | `src/core/retrieval.ts`, `test/indexed-retrieval.test.ts` | Controlled repro ruled out volume and addon concurrency: the original split was an uninitialized Backlog source preflight failure. The fix distinguishes pre-native preflight fallback from actual native failure without leaking private detail. Push, PR, and merge remain unauthorized. |
| 3 | LCLI-318 | Workspace validation ordering | LCLI-317 | To Do; dependency-blocked | — | `src/core/workspace-projection.ts`, `src/core/workspace-source.ts`, `src/core/workspace-retrieval.ts`, `test/workspace-retrieval.test.ts` | Shares workspace/native retrieval surfaces with LCLI-317 and cannot dispatch until that task is Done. |

## Resolved
| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-319 | 2026-08-06 / wave 1 | Both acceptance criteria verified; focused tests 86/86; typecheck; lint; full suite 2,526 passed, 1 skipped, 0 failed; real installed-binary probe; branch-local Lore check 65 files with 0 errors/warnings; all 8 PR checks passed. PR #329 exact head `fffd90a29e87df86a0b40e1d45921a4bc2d887fd` merged into `dev` as `d3193d725b2df6dd3c20c01da9e3f35ec26cf5d4`; settlement PR #330 exact head `6fd1e8dc13031c2a3a7cd77396aa894b6293521d` merged as `f03b52808f3a35f033a44205e58a9b9a680b1c16`. Adversarial self-review found no unresolved acceptance gap. |

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
- 2026-08-05 — delivery authorization follow-up: the user approved a local feature branch and local commit for the five LCLI-319 campaign paths. Work moved from `dev` to `fix/lcli-319-backlog-init-diagnostic`; task remains In Progress pending integration. Push, PR, merge, deletion, and publication remained unauthorized at that stage. The local implementation commit is `620ced12fbcaa5b504c9b4206913a781b3042bc1`.
- 2026-08-05 — remote delivery follow-up: after separate user approval, fetched `origin/dev` and confirmed it remained at base `b0523be9b5fdbc49f8440964d61ca2ef084bb11d`, so no rebase was needed; branch-local `bun run src/cli.ts check --json` passed 65 files with 0 errors and 0 warnings; pushed `fix/lcli-319-backlog-init-diagnostic`; opened PR #329 against `dev`. This task/tracker reconciliation was pushed as follow-up PR commit `fffd90a29e87df86a0b40e1d45921a4bc2d887fd`; merge, deletion, and publication remained unauthorized at that stage.
- 2026-08-06 — integration and settlement reconciliation: after explicit merge approval, PR #329 merged into `dev` as `d3193d725b2df6dd3c20c01da9e3f35ec26cf5d4`; a live GitHub query confirmed the exact PR head and all 8 successful checks, and local ancestry verification confirmed the head is contained in `origin/dev`. After separate reconciliation and prune approval, marked LCLI-319 Done with final evidence and prepared this tracker settlement on clean branch `chore/lcli-319-settlement` from the verified merge commit. LCLI-317 becomes the next ready campaign task only after this tracked settlement integrates.
- 2026-08-05 — restore reconciled the stale settlement claim: local `origin/dev` is `f03b52808f3a35f033a44205e58a9b9a680b1c16`, containing exact settlement head `6fd1e8dc13031c2a3a7cd77396aa894b6293521d`; the checkout is clean at that head with one worktree and the merged settlement branch intentionally retained because deletion is unauthorized. Live LCLI-317 has no dependencies and LCLI-318 remains formally blocked on it. Dispatched LCLI-317 as sequential wave 2; delivery actions remain unauthorized.
- 2026-08-06 — settled wave 2 at verified local-only state on `fix/lcli-317-indexed-preflight-advisory` from `origin/dev` at `f03b52808f3a35f033a44205e58a9b9a680b1c16`. The controlled installed-binary matrix proved identical initialized fixtures activate Ladybug serially on both APFS volumes and concurrently in 8/8 independent processes; indexed-required diagnostics identified the original failure as an uninitialized Backlog task-source read before any native call. The implementation now emits an accurate sanitized preflight advisory while preserving the native-failure advisory. Evidence: focused suite 34 passed; typecheck; lint over 191 files; full suite 2,527 passed, 1 skipped, 0 failed; real source CLI preflight probe; `git diff --check`; adversarial self-review found no unresolved acceptance gap. All three criteria are checked, but LCLI-317 remains In Progress and LCLI-318 remains blocked because commit, push, PR, and merge authority are absent.
- 2026-08-06 — local delivery authorization follow-up: the user approved one local commit containing the four LCLI-317 campaign paths on `fix/lcli-317-indexed-preflight-advisory`. Push, PR creation, merge, branch deletion, publication, LCLI-318 dispatch, and unrelated cleanup remain unauthorized; LCLI-317 stays In Progress pending integration.
