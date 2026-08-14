---
name: backlog-handover
description: Initialize, restore, deliver, inspect, or hand over bounded-parallel Lore CLI documentation campaigns with live Backlog evidence and one safe cursor.
---

# Backlog Handover

Backlog tasks are the lifecycle record, one compact Backlog document is the campaign tracker, and
`.claude/handovers/active.md` is a disposable restart pointer. Repository `AGENTS.md` controls
authority and pause boundaries; a tracker never enlarges them.

## Start every invocation

1. Run `backlog instructions overview`, then read applicable `AGENTS.md` files.
2. Select `init`, `restore`, `write`, or read-only `status`; an explicit mode wins and ambiguity
   means `status`.
3. Run the lifecycle audit when `.claude/handovers/` exists. A missing initial cursor is expected
   only until `init` writes it.
4. Before task work read `backlog instructions task-execution`; before terminal lifecycle work read
   `backlog instructions task-finalization`.
5. Read the complete mode reference: [init](references/init.md), [restore](references/restore.md),
   [delivery](references/delivery.md), or [handover](references/handover.md). `init` immediately
   continues into `restore`; successful wave boundaries do not stop a campaign.

## Authority and shared state

- Use Backlog CLI only for Backlog reads and mutations. Do not hand-edit `backlog/`.
- Recompute readiness and conflicts from live state at restore and after every wave. Dependencies,
  dirty work, shared paths, and generated Lore surfaces are conflict edges.
- The coordinator alone owns Backlog task/tracker state, active handovers, Lore-generated surfaces,
  integration, delivery, and campaign-created cleanup. Workers receive one task, one pinned-base
  worktree, and a non-overlapping path budget.
- Four specialized roles share at most three concurrent slots. Use the widest safe bounded-parallel
  wave: read-heavy work may use explorers and sweepers; normally use two writers and a reviewer.
  Serialize shared-state mutations and delivery.
- Preserve unrelated dirty work. Never infer authority to publish, promote a production branch,
  make material product/security/repository-admin choices, expand repository scope, or destroy
  pre-existing or unmerged state.

## Lore commit-side-effect preflight

Before invoking `lore link`, `lore unlink`, `lore rename`, or `lore sync`, use the exact Git worktree
root as the honest affected scope: these commands can update both `docs/` and `backlog/`. Run the shared gate:
`node .codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs --command <command>
--repository <worktree> --scope . --execute -- <Lore arguments>`.
These commands may create a Lore-authored `backlog/` commit: link/unlink commit task
back-references, rename commits linked-task moves, and sync sweeps remaining dirty Backlog state.
Pass `--explicit-commit-authority` or `--standing-delivery-authority` only when that authority covers
this repository and the in-scope work. For standing authority, also pass `--integration-branch
dev`; the gate verifies the exact Git worktree root, rejects narrower and symlinked scopes, and confirms the
repository records `dev` delivery authority. Otherwise, the gate denies dispatch before Lore or Git
runs. Stop before invoking the command and either request permission for that exact commit or record
the command, affected scope, and missing authority as a deferred stage. Never wait for the result
envelope to discover that it committed. This preserves ADR-0012's sole-committer contract.

## Durable limits

Keep one tracker below 200 lines and 32 KiB, and `active.md` below 120 lines and 16 KiB. Detailed
commands, evidence, and review findings belong on owning tasks. Exactly one executable cursor uses
`**Lifecycle**: executable-current` in `active.md`; retained history must be
`**Lifecycle**: historical-non-executable` with no paste-ready prompt, `$backlog-handover`
invocation, or imperative continuation instruction. Run the lifecycle audit after cursor changes.
Mechanically check every Backlog tracker with `backlog doc view <tracker-id> --plain | node
.codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs` before dispatch, delivery, or a
handover write.

## Completion and failure

Record validation by repository, tree SHA, command, and result; reuse it only for the same tree.
On a first gate failure diagnose, make one safe in-scope remediation, and rerun only invalidated
evidence. If it repeats, obtain independent review or an alternate safe fix when available, then
pause if it remains failed. End with concise counts, limitations, and the next safe action or exact
decision required.
