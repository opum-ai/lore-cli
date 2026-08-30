---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Operate autonomous Lore CLI documentation campaigns
tags:
  - operations
  - campaigns
  - backlog
  - codex
  - automation
summary: Records Lore CLI's bounded autonomous documentation campaign profile, authority, delivery, and validation economy.
timestamp: 2026-08-14T01:41:16.336Z
---

# Operate autonomous Lore CLI documentation campaigns

Lore CLI campaigns are bounded, autonomous work within this repository's recorded authority. They
advance from inventory through non-production delivery without routine approval pauses, while
publication, production promotion, material decisions, and unrelated destructive actions remain
explicit pause boundaries.

## Details

### Local authority

The applicable `AGENTS.md` is normative. A confirmed campaign may cover selected Lore CLI
documentation and repository-process tasks, their Backlog and Lore mutations, isolated worktrees,
commits and pull-request delivery to `dev`, and cleanup of
campaign-created artifacts proved merged. It does not authorize a second repository, `dev` to
`main`, package publication, credentials, repository administration, security or product choices,
or deletion of pre-existing/unmerged work.

Lore commands require a separate executable preflight: `lore link`, `lore unlink`, `lore rename`,
and `lore sync` can commit Backlog files. The coordinator runs
`.codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs` with the command, exact
worktree, and repository-root scope before dispatch. The repository root is the honest affected
scope because these commands can update both `docs/` and `backlog/`; narrower and symlinked scopes
are rejected. Before `sync`, the coordinator exactly allowlists every campaign-owned dirty Backlog
path. The gate discovers tracked, staged, and untracked Backlog changes and refuses dispatch if any
dirty path falls outside that allowlist, so unrelated task state cannot be swept into Lore's
catch-all commit. The gate permits dispatch only when explicit commit
authority or scoped standing delivery authority covers that work; otherwise it denies before Lore or
Git can mutate state. This keeps ADR-0012's sole-committer contract intact.

### Fast lane

Use Terra at medium effort for ordinary coordination and writing. Four narrow roles—explorer,
writer, reviewer, and sweeper—share no more than three concurrent slots, and the coordinator selects
the widest safe non-conflicting wave. The coordinator alone controls Backlog, the compact tracker,
active handover, Lore-managed surfaces, integration, and delivery. Writers receive one pinned-base
worktree and an explicit path budget; explorers, reviewers, and sweepers are read-only.

`init` inventories ready LCLI work, writes one compact tracker and active cursor, then enters the
first restore wave in the same turn. Restore grounds live tasks, dependencies, dirty paths, and
worktrees before every dispatch. A finished wave settles once, recomputes readiness, and continues;
it does not create a habitual handover boundary.

Carry every ready task through implementation, independent cumulative review, commit, an authorized
`dev` pull request and merge, task/tracker settlement, artifact cleanup, and the next newly ready
wave. Pending checks are monitored and first failures receive bounded remediation. A successful
wave, PR, merge, cleanup pass, or subjective preference for a smaller session is not a stop.

### Codex cursor and stop contract

Codex keeps its sole executable campaign cursor at `.codex/handovers/active.md` and never loads
`.claude/skills/**` for this loop. A legacy `.claude/handovers/active.md` is migration input only:
ground its claims against live Backlog and Git state, preserve any incomplete campaign in the Codex
cursor, remove the legacy executable file, and audit the legacy directory in complete mode.

A nonterminal run has exactly two exit forms. `human-decision` names a real authority boundary or
external blocker plus the one human action needed. `session-renewal` is reserved for an environment
stop or demonstrably unreliable context after durable state is flushed. Its grounded cursor records
the tracker, full SHA, branch, worktree, queue counts, verified stage, retained artifacts, and exact
next action. It tells the operator to run `/clear`, start a new Codex session in `lore-cli`, invoke
`$backlog-handover restore`, and continue without reconfirmation. Queue-empty completion removes the
cursor and passes the lifecycle audit in complete mode.

### Worktree and cleanup hygiene

The user-level `opum-worktrees` skill leases native Git worktrees under the Opum worktree root.
The coordinator records the returned path, immutable lease ID, holder,
task, and pinned base; workers never return their own lease. Identity-fenced return occurs only after
the work is merged, patch-equivalent, or every unique change is preserved on an owned branch.

Cleanup is evidence-driven. Campaign work already represented on `dev` by ancestry or patch
equivalence is safe cleanup. Unique in-scope work is preserved and routed through review and
delivery. Unrelated or decision-dependent work is retained with exact owner, reason, paths, and
cleanup condition. Safe pruning, merged-branch deletion, lease hygiene, and clean fast-forwarding
proceed independently instead of being bundled into a request to discard unique dirty changes.

### Evidence and limits

Keep trackers below 200 lines/32 KiB and active handovers below 120 lines/16 KiB. Detailed
commands, results, and review findings stay on tasks. Exactly one executable cursor is allowed;
archived handovers are non-executable provenance. The lifecycle fixture matrix rejects duplicate or
invalid stop classes, stale expected grounding, mismatched state/table rows, unknown stages,
contradictory lifecycle markers, nested Markdown or foreign-task continuation instructions, and a
completed campaign that retains a live cursor.

Record each gate by tree SHA, command, and result. Reuse it for an identical tree, but rerun it when
a rebase, conflict resolution, or generated rewrite changes the tree. Pure prose gets focused
checks during writing and one final strict Lore validation/check plus diff hygiene. Script, skill,
and configuration changes add only their relevant focused checks. A first failure gets diagnosis,
one safe correction, and a rerun; a repeated failure requires independent review or an alternate
safe fix before a pause.

Measure the first five campaigns: zero routine approval prompts after invocation, first edit in the
init turn, at least two concurrent ready tasks when two exist, at most one PR per repository per wave
(and no PR when a wave has no deliverable change), one tracker settlement per wave, one strict Lore
gate per final tree, and no duplicated full suite for an identical tree.
