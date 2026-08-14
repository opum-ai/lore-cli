---
name: backlog-handover
description: Initialize, restore, deliver, inspect, or hand over bounded-parallel Lore CLI documentation campaigns with live Backlog evidence and one safe cursor.
compatibility: Requires git, Backlog.md, Lore, and the repository-local progressive references under .codex/skills/backlog-handover.
---

# Backlog Handover

Backlog tasks are the lifecycle record, one compact Backlog document is the campaign tracker, and
`.claude/handovers/active.md` is a disposable restart pointer. Repository `AGENTS.md` controls
authority and pause boundaries; a tracker never enlarges them.

## Start every invocation

1. Run `backlog instructions overview`, then read applicable `AGENTS.md` files.
2. Select `init`, `restore`, `write`, or read-only `status`; an explicit mode wins and ambiguity
   means `status`.
3. Run `.codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs` when the handover
   directory exists. A missing initial cursor is expected only until `init` writes it.
4. Before task work read `backlog instructions task-execution`; before terminal lifecycle work read
   `backlog instructions task-finalization`.
5. Read the complete progressive reference for the selected mode under
   `.codex/skills/backlog-handover/references/`: `init.md`, `restore.md`, `delivery.md`, or
   `handover.md`. Init continues into restore in the same turn; successful wave boundaries do not
   stop a campaign.

## Authority and shared state

- Use Backlog CLI only for Backlog reads and mutations. Do not hand-edit `backlog/`.
- Recompute readiness and conflicts from live state at restore and after every wave. Dependencies,
  dirty work, shared paths, and generated Lore surfaces are conflict edges.
- The coordinator alone owns Backlog task/tracker state, active handovers, Lore-generated surfaces,
  integration, delivery, and campaign-created cleanup. Writers receive one task, one pinned-base
  worktree, and a non-overlapping path budget.
- Four specialized roles share at most three concurrent slots. Use the widest safe wave: explorers
  and sweepers for bounded discovery; normally two isolated writers and one independent reviewer.
- Preserve unrelated dirty work. Never infer authority to publish, promote `dev` to `main`, make
  material product/security/repository-admin choices, expand repository scope, or destroy
  pre-existing or unmerged state.

## Lore commit-side-effect preflight

Before `lore link`, `lore unlink`, `lore rename`, or `lore sync`, use the exact Git worktree root as
the honest affected scope: these commands can update both `docs/` and `backlog/`. Invoke only through:

`node .codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs --command <command>
--repository <worktree> --scope . --execute -- <Lore arguments>`

Pass `--explicit-commit-authority` only for an exact user grant. Pass
`--standing-delivery-authority --integration-branch dev` only when the selected Lore CLI campaign
and repository instructions cover that work. The gate verifies the exact Git worktree, rejects
narrower and symlinked scopes, and confirms `dev` delivery authority before Lore can run. Without
authority, request the exact permission or record a deferred stage; never discover a commit from a
result envelope after the fact.

## Durable limits

Keep one tracker below 200 lines and 32 KiB, and `active.md` below 120 lines and 16 KiB. Audit a
Backlog tracker through stdin before dispatch, delivery, or handover:

`backlog doc view <tracker-id> --plain | node
.codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs`

Exactly one executable cursor uses `**Lifecycle**: executable-current` in `active.md`. Historical
handovers use `**Lifecycle**: historical-non-executable` and contain no paste-ready prompt,
backlog-handover invocation, or imperative continuation instruction.

## Completion and failure

Record validation by exact tree SHA and reuse it only while the tree is unchanged. A first gate
failure gets diagnosis, one safe correction, and a focused rerun. After a repeated failure, obtain
independent review or an alternate safe fix before pausing. Deliver at most one Lore CLI PR to
`dev` per wave; a wave with no deliverable change may settle without a PR. Clean only
campaign-created artifacts proved merged.
