---
id: doc-17
title: Backlog campaign tracker — single-active handover hygiene
type: other
created_date: '2026-08-12 22:37'
updated_date: '2026-08-12 22:37'
---
# Backlog campaign tracker — single-active handover hygiene

## Scope and order confirmation
- Scope: execute LCLI-322 only, restoring the single-active-cursor invariant across ignored handover archives and adding a deterministic lifecycle audit.
- Confirmed by the user: "proceed as planned" on 2026-08-12, after the proposed next campaign was explicitly limited to the handover-hygiene follow-up.
- Order is a tie-break; readiness is recomputed live before dispatch.
- Execution model: one sequential wave. The task owns ignored handover disposition, current-pointer grounding, and the backlog-handover guardrail, so parallel execution would create direct lifecycle and file conflicts.
- Initialization boundary: this tracker and the active handover establish the campaign only. LCLI-322 remains To Do until a later execution turn.

## Grounded start state
- The previous Lore CLI 0.2.0 campaign is complete: LCLI-321 is Done and its final closeout reached main through PR #352 at 055ec4e6ff4a9a0cd829e41b6b1ff5ed9e6849a1.
- Campaign base is origin/dev at ff56e0281e0ab72c4a51b45ea0b78e57c3714324; that dev commit is an ancestor of current origin/main.
- No task is In Progress. LCLI-322 is dependency-free and is the only task admitted to this queue.
- The primary worktree contains release-settlement residue that is already integrated plus the local active handover surface; it is not campaign implementation input and must not be swept into tracked changes.

## Frontier
Informational snapshot only; never a promised next wave.

- LCLI-322 is dependency-ready but remains To Do at the initialization boundary.
- Before execution, re-ground the ignored handover inventory, executable-language count, Git refs, task state, worktrees, and file-conflict surface.
- The cleanup must preserve unique unfinished evidence and must not place machine-specific paths or secrets into tracked history.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | LCLI-322 | Handover lifecycle hygiene | none | To Do; initialized, not dispatched | 1 | .claude/handovers/; .codex/skills/backlog-handover/; focused tests; Backlog/Lore evidence | Require exactly one executable active pointer and a deterministic audit that rejects stale executable archives. |

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
