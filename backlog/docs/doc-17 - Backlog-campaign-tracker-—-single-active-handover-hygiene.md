---
id: doc-17
title: Backlog campaign tracker — single-active handover hygiene
type: other
created_date: '2026-08-12 22:37'
updated_date: '2026-08-13 04:42'
---
# Backlog campaign tracker — single-active handover hygiene

## Scope and confirmation

- Scope was LCLI-322 only: restore the single-active-cursor invariant across ignored handovers and add a deterministic lifecycle audit.
- The user confirmed this one-task campaign, approved a non-destructive history split after a concurrent research-branch change, and later authorized pushing the dedicated branch and opening its PR.
- Execution stayed sequential because the task owned the handover disposition, canonical cursor, guardrail, Backlog evidence, Story synchronization, and delivery record.

## Grounded base and isolation

- Execution base: dev/origin/dev at 319edc7fc3fafef7a384834eee418545aa2dc484.
- The original primary worktree contained user-owned competitive-research work. Corrective commit 4187947 restored only LCLI-322 and doc-17 on that research branch, retaining LCLI-323 through LCLI-325 unchanged.
- LCLI-322 executed on dedicated branch chore/lcli-322-handover-hygiene. The branch was pushed at 63df417 and PR #354 was opened against dev; merge remains unperformed.

## Queue

| Order | Task | Dependencies | State | Wave | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-322 | none | Done; PR #354 open | 1 | active.md is the sole executable cursor; 57 obsolete ignored archives were reconciled and quarantined; deterministic lifecycle audit and focused tests added. |

## Resolved

- LCLI-322 — Done. Live Backlog/Git reconciliation found no unfinished task claim requiring an archive to remain executable. Unique relevant evidence was preserved in the task and this tracker.
- Exactly one ignored handover remains in .claude/handovers/: active.md with lifecycle: executable-current. The 57 obsolete files were moved to recoverable session-local quarantine outside the repository.
- The backlog-handover skill now makes active.md canonical and runs the lifecycle audit during init, write, restore, and status workflows.
- Verification: 7 focused tests / 13 assertions; real-directory audit pass; typecheck pass; lint pass on 196 files; full suite 2,560 pass, 1 skip, 0 fail across 79 files / 8,739 assertions; strict Lore validation/check and git diff --check pass.
- Delivery: dedicated branch pushed and PR #354 opened against dev from head 63df417. No merge was authorized or performed.

## Outside scope

- LCLI-323, LCLI-324, and LCLI-325 remain owned by the research campaign.
- LCLI-326 and LCLI-327 are unrelated follow-up records in the primary research checkout and were not modified by this campaign.
- LCLI-278 remains a separate repository-admin/security decision.
- LCLI-315 and LCLI-315.4 remain outside this hygiene campaign.
- LCLI-42 remains on hold; LCLI-43 through LCLI-45 remain deferred.

## Wave log

- 2026-08-12 — initialized the confirmed one-task campaign after the Lore CLI 0.2.0 release campaign reached main.
- 2026-08-12/13 — restored against dev at 319edc7, reconciled 58 ignored handovers, verified historical claims, and dispatched LCLI-322 as the sole wave.
- 2026-08-13 — user-approved corrective commit 4187947 separated LCLI-322/doc-17 from the research branch without disturbing LCLI-323 through LCLI-325.
- 2026-08-13 — completed implementation and objective verification on chore/lcli-322-handover-hygiene; queue became empty and the campaign settled locally.
- 2026-08-13 — user authorized delivery; pushed the dedicated branch at 63df417 and opened PR #354 against dev. The branch/worktree remain retained pending review or separate merge authorization.
