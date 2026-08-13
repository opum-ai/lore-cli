---
id: doc-17
title: Backlog campaign tracker — single-active handover hygiene
type: other
created_date: '2026-08-12 22:37'
updated_date: '2026-08-13 04:18'
---
# Backlog campaign tracker — single-active handover hygiene

## Scope and confirmation

- Scope was LCLI-322 only: restore the single-active-cursor invariant across ignored handovers and add a deterministic lifecycle audit.
- The user confirmed this one-task campaign, then approved a non-destructive history split after a concurrent research-branch change.
- Execution stayed sequential because the task owned the handover disposition, canonical cursor, guardrail, Backlog evidence, and Story synchronization.

## Grounded base and isolation

- Execution base: dev/origin/dev at 319edc7fc3fafef7a384834eee418545aa2dc484.
- The original primary worktree contained user-owned competitive-research work. Corrective commit 4187947 restored only LCLI-322 and doc-17 on that research branch, retaining LCLI-323 through LCLI-325 unchanged.
- LCLI-322 executed on dedicated local branch chore/lcli-322-handover-hygiene. Remote publication is intentionally pending separate authorization.

## Queue

| Order | Task | Dependencies | State | Wave | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-322 | none | Done | 1 | active.md is the sole executable cursor; 57 obsolete ignored archives were reconciled and quarantined; deterministic lifecycle audit and focused tests added. |

## Resolved

- LCLI-322 — Done. Live Backlog/Git reconciliation found no unfinished task claim requiring an archive to remain executable. Unique relevant evidence was preserved in the task and this tracker.
- Exactly one ignored handover remains in .claude/handovers/: active.md with lifecycle: executable. The 57 obsolete files were moved to recoverable session-local quarantine outside the repository.
- The backlog-handover skill now makes active.md canonical and runs the lifecycle audit during init, write, restore, and status workflows.
- Verification: 7 focused tests / 13 assertions; real-directory audit pass; typecheck pass; lint pass on 196 files; full suite 2,560 pass, 1 skip, 0 fail across 79 files / 8,739 assertions; git diff --check pass.

## Outside scope

- LCLI-323, LCLI-324, and LCLI-325 remain owned by the research campaign.
- LCLI-278 remains a separate repository-admin/security decision.
- LCLI-315 and LCLI-315.4 remain outside this hygiene campaign.
- LCLI-42 remains on hold; LCLI-43 through LCLI-45 remain deferred.

## Wave log

- 2026-08-12 — initialized the confirmed one-task campaign after the Lore CLI 0.2.0 release campaign reached main.
- 2026-08-12/13 — restored against dev at 319edc7, reconciled 58 ignored handovers, verified historical claims, and dispatched LCLI-322 as the sole wave.
- 2026-08-13 — user-approved corrective commit 4187947 separated LCLI-322/doc-17 from the research branch without disturbing LCLI-323 through LCLI-325.
- 2026-08-13 — completed implementation and objective verification on chore/lcli-322-handover-hygiene; queue is empty and the campaign is settled locally.
