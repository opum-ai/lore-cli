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
worktree, and affected scope before dispatch. The gate permits dispatch only when explicit commit
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

### Evidence and limits

Keep trackers below 200 lines/32 KiB and active handovers below 120 lines/16 KiB. Detailed
commands, results, and review findings stay on tasks. Exactly one executable cursor is allowed;
archived handovers are non-executable provenance.

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
