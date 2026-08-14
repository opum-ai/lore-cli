---
name: backlog-handover
description: Initialize, restore, deliver, inspect, or hand over bounded-parallel Lore CLI documentation campaigns with live Backlog evidence and one safe cursor.
---

# Backlog Handover

Drive Lore CLI campaigns from live Backlog, Git, and Lore state. Backlog tasks are the lifecycle
record, one compact Backlog document is the campaign tracker, and
`.codex/handovers/active.md` is the disposable Codex restart pointer. Repository `AGENTS.md`
controls authority and pause boundaries; a tracker never enlarges them.

## Start every invocation

1. Run `backlog instructions overview`, then read applicable `AGENTS.md` files.
2. Select `init`, `restore`, `write`, or read-only `status`; an explicit mode wins and ambiguity
   means `status`.
3. Use `.codex/handovers/active.md` as the only current Codex cursor. If legacy
   `.claude/handovers/active.md` exists, treat it only as migration input: ground its tracker and Git
   claims live, write still-incomplete state to the Codex cursor, remove the legacy active file, and
   run `node .codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs
   .claude/handovers --complete`. Never load `.claude/skills/**` for this flow. Audit the Codex
   directory whenever it exists; a nonterminal audit must include the live expected tracker, SHA,
   branch, worktree, and queue counts from `references/handover.md`.
4. Before task work read `backlog instructions task-execution`; before terminal lifecycle work read
   `backlog instructions task-finalization`.
5. Read the complete mode reference: [init](references/init.md), [restore](references/restore.md),
   [delivery](references/delivery.md), or [handover](references/handover.md). `init` immediately
   continues into `restore`; successful wave boundaries do not stop a campaign.

## Authority and shared state

- Use Backlog CLI only for Backlog reads and mutations. Do not hand-edit `backlog/`.
- Trust live Backlog tasks first, then the active campaign document, then the short Codex cursor.
  Reconcile stale durable state before dispatch; cursor prose never overrides live Git or Backlog.
- Recompute readiness and conflicts from live state at restore and after every wave. Dependencies,
  dirty work, shared paths, and generated Lore surfaces are conflict edges.
- The coordinator alone owns Backlog task/tracker state, active handovers, Lore-generated surfaces,
  integration, delivery, and campaign-created cleanup. Workers receive one task, one pinned-base
  worktree, and a non-overlapping path budget.
- Four specialized roles share at most three concurrent slots. Use the widest safe bounded-parallel
  wave: read-heavy work may use explorers and sweepers; normally use two writers and a reviewer.
  Serialize shared-state mutations and delivery. When Treehouse is available, use the
  `treehouse-worktrees` skill for fenced leases and coordinator-owned settlement.
- Carry each ready task through implementation, independent review, commit, `dev` PR and merge,
  task/tracker settlement, and owned artifact cleanup. Run a cumulative review on the integrated
  wave. Recompute readiness immediately; a wave, PR, merge, or cleanup pass is not a stop.
- Batch reviewed work into at most one PR for this repository per wave. Record validation against
  the exact tree SHA and reuse it only while that tree is unchanged.
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
repository records `dev` delivery authority. Before `sync`, repeat `--allow-backlog-path
<exact-repository-relative-path>` for every campaign-owned dirty Backlog task or document. The gate
enumerates tracked, staged, and untracked Backlog changes and refuses dispatch if any dirty path is
not exactly allowlisted; an empty dirty Backlog needs no flag. Otherwise, the gate denies dispatch before Lore or Git
runs. Stop before invoking the command and either request permission for that exact commit or record
the command, affected scope, and missing authority as a deferred stage. Never wait for the result
envelope to discover that it committed. This preserves ADR-0012's sole-committer contract.

## Durable limits and cleanup

Keep one tracker below 200 lines and 32 KiB, and `active.md` below 120 lines and 16 KiB. Detailed
commands, evidence, and review findings belong on owning tasks. Exactly one executable cursor uses
`**Lifecycle**: executable-current` in `active.md`; retained history must be
`**Lifecycle**: historical-non-executable` with no paste-ready prompt, `$backlog-handover`
invocation, or imperative continuation instruction. Run the lifecycle audit after cursor changes.
Mechanically check every Backlog tracker with `backlog doc view <tracker-id> --plain | node
.codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs` before dispatch, delivery, or a
handover write.

Classify cleanup by evidence, not age, name, or clean status. Work already represented on `dev` by
ancestry or patch equivalence is safe campaign-created cleanup. Preserve unique in-scope work on an
owned recovery branch and return it through review and delivery. Retain unrelated or
decision-dependent work with exact owner, reason, paths, and cleanup condition. Never bundle safe
pruning, merged-branch deletion, Treehouse lease hygiene, or a clean fast-forward into a request to
discard unique changes.

## Completion and failure

Record validation by repository, tree SHA, command, and result; reuse it only for the same tree.
On a first gate failure diagnose, make one safe in-scope remediation, and rerun only invalidated
evidence. If it repeats, obtain independent review or an alternate safe fix when available, then
pause only if it remains failed.

Every nonterminal exit is exactly one of:

- `human-decision`: name the actual repository pause condition and the one decision or external
  action required. Retain affected artifacts with an owner and cleanup condition.
- `session-renewal`: flush durable state because the environment must stop or context is no longer
  reliable, then tell the operator to run `/clear`, start a new session in `lore-cli`, invoke
  `$backlog-handover restore`, and continue without reconfirmation.

A subjective preference for a shorter transcript does not justify either class. On queue-empty
completion, remove the Codex cursor and pass the lifecycle audit with `--complete`. End each mode
with compact queue counts, tracker, branch/worktree and last-stage grounding, retained-artifact
disposition, and either the next automatic action already taken or the exact human decision needed.
