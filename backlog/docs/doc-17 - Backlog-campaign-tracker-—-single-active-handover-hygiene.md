---
id: doc-17
title: Backlog campaign tracker — single-active handover hygiene
type: other
created_date: '2026-08-12 22:37'
updated_date: '2026-08-13 03:49'
---
# Backlog campaign tracker — single-active handover hygiene

## Scope and order confirmation
- Scope: execute LCLI-322 only, restoring the single-active-cursor invariant across ignored handover archives and adding a deterministic lifecycle audit.
- Confirmed by the user: "proceed as planned" on 2026-08-12, after the proposed next campaign was explicitly limited to the handover-hygiene follow-up.
- Order is a tie-break; readiness is recomputed live before dispatch.
- Execution model: one sequential wave. The task owns ignored handover disposition, current-pointer grounding, and the backlog-handover guardrail, so parallel execution would create direct lifecycle and file conflicts.
- Initialization boundary: satisfied. Restore on 2026-08-12 re-grounded the task and dispatched wave 1.

## Grounded start state
- The previous Lore CLI 0.2.0 campaign is complete: LCLI-321 is Done and its final closeout reached main through PR #352 at 055ec4e6ff4a9a0cd829e41b6b1ff5ed9e6849a1.
- Campaign execution base is dev/origin/dev at 319edc7fc3fafef7a384834eee418545aa2dc484; the locally known refs are equal at dispatch.
- No other task is In Progress. LCLI-322 is dependency-free and is the only task admitted to this queue.
- The primary worktree has unrelated user-owned competitive-research documentation and research files. They do not overlap LCLI-322's handover/skill/test surface and must remain untouched.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-322 is In Progress in sequential wave 1.
- Restore found 58 ignored Markdown files: active.md plus 57 obsolete files. Twenty-eight files contained executable-style cursor language, one more than the initialization observation.
- Historical in-flight claims were checked against live Backlog and Git evidence: no task is In Progress; LCLI-315.1 and the sampled delivery tasks LCLI-298, LCLI-299, LCLI-300, LCLI-302, LCLI-305, LCLI-306, LCLI-314.6, LCLI-317, LCLI-319, LCLI-320, and LCLI-321 are Done; the retained LCLI-315.1 base is an ancestor of dev.
- Cleanup must preserve unique unfinished evidence, avoid the unrelated dirty paths, and keep secrets and machine-specific paths out of tracked history.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-322 | Handover lifecycle hygiene | none | In Progress; dispatched 2026-08-12 | 1 | .claude/handovers/; .codex/skills/backlog-handover/; test/backlog-handover-lifecycle.test.ts; Backlog evidence | Require exactly one executable active pointer and a deterministic audit that rejects stale executable archives. |

## Resolved
No tasks resolved in this campaign yet.

## Not queued — blocked, deferred, or outside scope
- LCLI-278: separate repository-admin/security decision; future automated publish:true dispatches remain prohibited until its external approval control is effective.
- LCLI-315 and LCLI-315.4: tracker roadmap work outside this hygiene campaign; Quest remains dependent on its public package availability.
- LCLI-42: explicitly on hold.
- LCLI-43, LCLI-44, and LCLI-45: explicitly deferred.
- Completed release, OKF 0.2, and tracker-foundation work: historical context only.

## Wave log
- 2026-08-12 — initialized the confirmed single-task campaign after the Lore CLI 0.2.0 release campaign reached main. Preserved the original CLI-created LCLI-322 identity, rejected an accidental duplicate allocation before tracking it, grounded origin/dev at ff56e02 and origin/main at 055ec4e, found no In Progress task, and stopped before task execution as required by the initialization boundary.
- 2026-08-12 — restored against dev/origin/dev at 319edc7 with one worktree. Reconciled handover drift: the primary has unrelated competitive-research changes; the ignored inventory remains 58 Markdown files but executable-style cursor files increased from 27 to 28; all sampled historical in-flight work is live-Done and the LCLI-315.1 base is merged. Dispatched LCLI-322 as the sole sequential wave with no path overlap.
