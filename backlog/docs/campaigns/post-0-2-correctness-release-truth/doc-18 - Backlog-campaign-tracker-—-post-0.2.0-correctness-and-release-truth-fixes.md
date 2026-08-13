---
id: doc-18
title: Backlog campaign tracker — post-0.2.0 correctness and release-truth fixes
type: other
created_date: '2026-08-13 13:17'
updated_date: '2026-08-13 18:18'
---
# Backlog campaign tracker — post-0.2.0 correctness and release-truth fixes

## Scope and order confirmation

- Scope: LCLI-325, LCLI-323, LCLI-324, and LCLI-327 only.
- Confirmed by the user: "proceed" on 2026-08-13, confirming the proposed four-task scope, order, and decisions.
- Decision for LCLI-323: default date-sensitive evaluation to the HEAD commit date and support an explicit `--as-of` input.
- Decision for LCLI-324: retain bundle-scoped link checking and expose skipped out-of-bundle relative links in the report/count.
- Decision for LCLI-327: prevent persistent E2E identity writes and record that existing `dev` history will not be rewritten.
- Order is a tie-break; readiness, dependencies, and conflicts are recomputed live.
- Execution is sequential unless the user separately authorizes subagents and isolated worktrees.

## Frontier

Informational snapshot only; never a promised next wave.

- LCLI-323 is Done after PR #364 passed all eight required CI jobs and merged to `dev` as `d97c4ae9289f6247bb869ad87150229091c7d622`; its exact green head `f3dcc987b3ab5045c1fe5ca8f3328a5a20dd0266` is a verified ancestor of live `origin/dev`.
- The active owner is `docs/stories/harden-post-0-2-lore-correctness.md`; Lore settlement will reconcile its managed rollup from LCLI-323's terminal task state.
- LCLI-324 and LCLI-327 remain live `To Do` tasks with no formal dependencies. Their readiness must be recomputed after this settlement is integrated; neither is pre-dispatched.
- All Lore documentation mutations converge on generated indexes/logs and must be serialized through Lore.

## Queue

| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 3 | LCLI-324 | deterministic checks | none | Queued; live `To Do` | — | `src/core/check.ts`, `src/commands/check.ts`, check/output tests, CLI docs, Lore-generated files | Keep the bundle boundary but report/count skipped out-of-bundle relative links. Recompute against integrated LCLI-323 before dispatch. |
| 4 | LCLI-327 | E2E safety/provenance | none | Queued; live `To Do` | — | `docker/e2e/run-e2e.sh`, `test/docker-e2e-guard.test.ts`, Docker E2E runbook, Lore-generated files | Make identity configuration non-persistent and harden negative controls. Do not rewrite existing `dev` history. |

## Resolved

| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-325 | 2026-08-13 / wave 1 | Done. PR #359 passed all eight CI jobs and merged to `dev` as `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`. Exact release-truth assertions, 2,560 tests, strict Lore validation/check, diff hygiene, and adversarial self-review passed. |
| LCLI-323 | 2026-08-13 / wave 2 | Done. Added explicit `--as-of`, defaulted temporal checks to the exact HEAD committer date, avoided Git reads for non-temporal bundles, and added contracts, documentation, and regression controls. Local verification passed 2,570 tests with 1 intentional skip plus typecheck/lint/build and strict Lore gates. PR #364 passed all eight required CI jobs and merged exact head `f3dcc987b3ab5045c1fe5ca8f3328a5a20dd0266` to `dev` as `d97c4ae9289f6247bb869ad87150229091c7d622`. |

## Not queued — blocked, deferred, or human decision required

- LCLI-328: created as a follow-up for the mismatch between backlog-handover's no-commit authorization boundary and Lore's documented self-committing commands. It is outside this confirmed campaign scope.
- LCLI-278: repository-admin/security decision remains open because the private-repository billing plan does not support the required release Environment reviewer control.
- LCLI-315: parent initiative container excluded; executable subtasks LCLI-315.1 through LCLI-315.3 are Done, while LCLI-315.4 remains blocked.
- LCLI-315.4: direct public registry query on 2026-08-13 returned npm `E404` for `@opum-ai/quest`; implementation remains prohibited.
- LCLI-326: excluded because the current implementation already regenerates `log.md` from pinned Git history. Live analysis found 381 entries, 174 cross-section repeats, and zero within-section duplicates; the repeats reflect one commit listed under multiple touched folder sections, not append-only duplication as filed. Rescope or close separately.
- LCLI-42: explicitly on hold.
- LCLI-43 and LCLI-45: explicitly deferred.
- LCLI-44: deferred and formally depends on deferred LCLI-43.

## Wave log

- 2026-08-13 — initialized the user-confirmed four-task campaign from clean `dev` at `9ad7b99a27e216e066752dca57c2b9d315d56430`, synchronized with locally cached `origin/dev` and with only the primary worktree registered. No task was dispatched.
- 2026-08-13 — dispatched LCLI-325 as the sole task in sequential wave 1 after restore found no drift, no formal dependency blocker, and no source-file conflict with the Backlog-owned tracker mutation.
- 2026-08-13 — paused wave 1 before source edits when Lore coupling automatically committed Backlog metadata as `804534f13e7d83a6078fa4b6a6e8bf198080ddd3`. The Story frontmatter addition remained uncommitted pending user disposition.
- 2026-08-13 — user retained `804534f13e7d83a6078fa4b6a6e8bf198080ddd3`; LCLI-325 implementation then completed locally. `lore validate --strict`, `git diff --check`, focused README scans, and 2,560 tests passed; `lore sync --dry-run` predicted two managed doc updates.
- 2026-08-13 — user authorized actual Lore synchronization. `lore sync` created scoped Backlog commit `00ae852096088f6e7df1f7b44e050a5724e2b448` with exactly LCLI-325, LCLI-328, and doc-18, then strict validation/check and executable release-truth assertions passed.
- 2026-08-13 — PR #359 passed all eight CI jobs and merged LCLI-325 to `dev` as `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`. The live task was marked Done and wave 1 was settled on branch `chore/lcli-325-final-settlement`.
- 2026-08-13 — PR #360 passed all eight CI jobs and merged the settlement to `dev` as `c258e45b1c77de8141e0de159c594454e4041653`.
- 2026-08-13 — PR #361 passed all eight CI jobs and promoted exact `dev` head `c258e45b1c77de8141e0de159c594454e4041653` to `main` as `6d834acb90cf1ae3c66b47c73f47b40fe9f40c00`. Closure audit confirmed both delivery commits were ancestors of live `dev` and `main`; the local and remote delivery branches were deleted, stale remote refs and worktrees were pruned, and local integration branches were fast-forwarded to their remotes.
- 2026-08-13 — restore found no drift: clean synchronized `dev` at `4d61d8da7d62912d6c965144b306432d555b74af`, one worktree, no open PRs, and all live task states matched the tracker. Dispatched LCLI-323 as the sole task in sequential wave 2; LCLI-324 remained queued because its check/docs surface conflicted with LCLI-323.
- 2026-08-13 — wave 2 implementation for LCLI-323 completed and all seven acceptance criteria were verified locally: 2,570 tests passed with 1 intentional skip, typecheck/lint/build passed, strict Lore validation and source check passed, and adversarial self-review fixed a moving-HEAD race.
- 2026-08-13 — user authorized the recommended active Story, Lore self-commits, and source delivery. Created and coupled `harden-post-0-2-lore-correctness`; Lore produced scoped Backlog commits `5de7c99`, `b65e49f`, and `f2aa77e`; source/docs commit `419cbfe` opened PR #364 against `dev`.
- 2026-08-13 — user authorized merge and settlement. PR #364 passed all eight required CI jobs on final head `f3dcc987b3ab5045c1fe5ca8f3328a5a20dd0266` and merged to `dev` as `d97c4ae9289f6247bb869ad87150229091c7d622`. Exact ancestry was verified; LCLI-323 was marked Done and wave 2 entered Lore/tracker settlement.
