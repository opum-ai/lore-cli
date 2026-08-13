---
id: doc-17
title: Backlog campaign tracker — single-active handover hygiene
type: other
created_date: '2026-08-12 22:37'
updated_date: '2026-08-13 11:10'
---
# Backlog campaign tracker — single-active handover hygiene

## Scope and confirmation

- Scope was LCLI-322 only: restore the single-active-cursor invariant across ignored handovers and add a deterministic lifecycle audit.
- The user confirmed this one-task campaign, approved the non-destructive research split, authorized branch/PR delivery and merge, then authorized final settlement, promotion to `main`, and exact branch/worktree pruning.
- Execution and delivery remained serial so Backlog, Lore, Git, and ignored restart state could be reconciled without crossing into the research campaign.

## Grounded delivery

- Execution base was `dev`/`origin/dev` at `319edc7fc3fafef7a384834eee418545aa2dc484`.
- Corrective research commit `4187947e3d3f4503f2afcddf840cb8c2824eb52b` restored only LCLI-322/doc-17 there while retaining research-owned LCLI-323 through LCLI-325.
- PR #354 delivered verified head `d4bbc491c940518eca39a14f1dda49182dbc1df4` to `dev` through merge commit `8746dae46bfa06f11ecdb44ba9637feee085642d` after all eight CI jobs passed.
- PR #355 delivered the final two-file Backlog reconciliation from verified head `77e2004e5f6d77704b8752151a651b9420761e10` to `dev` through merge commit `b0173172d8ac358bfb840db59808a748468192ff` after all eight CI jobs passed.
- The PR #355 remote and local feature refs were removed during the authorized merge; its clean worktree was repurposed from `dev` for this final protected settlement.

## Queue

| Order | Task | Dependencies | State | Wave | Result |
| --- | --- | --- | --- | --- | --- |
| 1 | LCLI-322 | none | Done; reconciled in `dev` | 1 | `active.md` is the sole executable cursor; 57 obsolete ignored archives reconciled and quarantined; deterministic lifecycle audit and focused tests added; implementation and settlement merged through PRs #354 and #355. |

## Resolved

- LCLI-322 — Done; implementation integrated through PR #354 at `8746dae`, and final task/tracker reconciliation integrated through PR #355 at `b017317`.
- Exactly one ignored handover remains in `.claude/handovers/`: `active.md` with `lifecycle: executable-current`. The 57 obsolete files remain in recoverable session-local quarantine outside the repository.
- The backlog-handover skill makes `active.md` canonical and audits init, write, restore, and status workflows.
- Verification: 7 focused tests / 13 assertions; real-directory audit pass; typecheck pass; lint pass on 196 files; full suite 2,560 pass, 1 skip, 0 fail across 79 files / 8,739 assertions; strict Lore validation/check and `git diff --check` pass; all eight jobs passed on both PR #354 and PR #355.
- Cleanup: the merged implementation branch/worktree and PR #355 reconciliation refs were removed with explicit approval. The temporary final-settlement ref/worktree is authorized for pruning after protected promotion; the primary research checkout and its unrelated LCLI-326/LCLI-327 files remain outside this campaign.

## Outside scope

- LCLI-323, LCLI-324, and LCLI-325 remain owned by the research campaign.
- LCLI-326 and LCLI-327 remain unrelated files in the primary research checkout and were not modified.
- LCLI-278 remains a separate repository-admin/security decision.
- LCLI-315 and LCLI-315.4 remain outside this campaign.
- LCLI-42 remains on hold; LCLI-43 through LCLI-45 remain deferred.

## Wave log

- 2026-08-12 — initialized the confirmed one-task campaign after the Lore CLI 0.2.0 release campaign reached `main`.
- 2026-08-12/13 — restored against `dev` at `319edc7`, reconciled 58 ignored handovers, verified historical claims, and dispatched LCLI-322 as the sole wave.
- 2026-08-13 — corrective commit `4187947` separated LCLI-322/doc-17 from the research branch without disturbing LCLI-323 through LCLI-325.
- 2026-08-13 — completed implementation and objective verification, pushed `chore/lcli-322-handover-hygiene`, and opened PR #354.
- 2026-08-13 — merged PR #354 at `8746dae` after eight successful CI jobs.
- 2026-08-13 — removed the merged implementation worktree and local/remote branch with explicit approval.
- 2026-08-13 — delivered the post-merge task/tracker reconciliation through PR #355 at `b017317` after all eight CI jobs passed; its local and remote feature refs were removed during the authorized merge.
- 2026-08-13 — opened final protected settlement for promotion to `main`; its temporary delivery ref/worktree is authorized for pruning after merge verification.
