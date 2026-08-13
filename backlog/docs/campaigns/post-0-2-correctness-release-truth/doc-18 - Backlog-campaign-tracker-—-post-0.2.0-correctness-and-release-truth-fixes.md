---
id: doc-18
title: Backlog campaign tracker — post-0.2.0 correctness and release-truth fixes
type: other
created_date: '2026-08-13 13:17'
updated_date: '2026-08-13 14:48'
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

- LCLI-323, LCLI-324, and LCLI-327 are live `To Do` tasks with no formal dependencies.
- LCLI-323 and LCLI-324 share the check implementation, tests, and CLI documentation and therefore conflict.
- All Lore documentation mutations converge on generated indexes/logs and must be serialized through Lore.
- Recompute repository and remote state after this settlement lands before dispatching another task.

## Queue

| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | LCLI-323 | deterministic checks | none | Queued; live `To Do` | — | `src/commands/check.ts`, `src/core/check.ts`, CLI routing/manifest as needed, check tests, CLI/OKF docs, Lore-generated files | Use HEAD commit date by default and add explicit `--as-of`; resolve every date-sensitive rule from one input. |
| 3 | LCLI-324 | deterministic checks | none | Queued; live `To Do` | — | `src/core/check.ts`, `src/commands/check.ts`, check/output tests, CLI docs, Lore-generated files | Keep the bundle boundary but report/count skipped out-of-bundle relative links. Conflicts with LCLI-323. |
| 4 | LCLI-327 | E2E safety/provenance | none | Queued; live `To Do` | — | `docker/e2e/run-e2e.sh`, `test/docker-e2e-guard.test.ts`, Docker E2E runbook, Lore-generated files | Make identity configuration non-persistent and harden negative controls. Do not rewrite existing `dev` history. |

## Resolved

| Task | Date/wave | Evidence and disposition |
| --- | --- | --- |
| LCLI-325 | 2026-08-13 / wave 1 | Done. PR #359 passed all eight CI jobs and merged to `dev` as `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`. Exact release-truth assertions, 2,560 tests, strict Lore validation/check, diff hygiene, and adversarial self-review passed. |

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
- 2026-08-13 — PR #359 passed all eight CI jobs and merged LCLI-325 to `dev` as `c0b94d964ba1f94b9f2d1ab55dbb1f69fb6b8790`. The live task was marked Done and wave 1 was settled on branch `chore/lcli-325-final-settlement`; promotion and cleanup remain authorized follow-on stages.
