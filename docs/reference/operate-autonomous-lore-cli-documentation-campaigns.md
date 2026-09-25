---
# yaml-language-server: $schema=../../.lore/schemas/reference.schema.json
type: Reference
title: Operate autonomous Lore CLI documentation campaigns
tags:
  - operations
  - campaigns
  - quest
  - handoff
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

This repository's `CLAUDE.md` is normative, including the fleet operating block it imports. A
confirmed campaign may cover selected Lore CLI documentation and repository-process tasks, their
Quest and Lore mutations, task branches, commits and pull-request delivery to `dev`, and cleanup of
campaign-created artifacts proved merged. It does not authorize a second repository, `dev` to
`main`, package publication, credentials, repository administration, security or product choices,
or deletion of pre-existing/unmerged work.

`lore link`, `lore unlink`, `lore rename`, and `lore sync` commit tracker files only when the
configured tracker backend is Backlog; Quest and Jira keep their own storage (LCLI-573). This
repository's backend is Quest (`.lore/config.toml`), so here those commands write `docs/` and Quest
records and commit nothing themselves. Their changes land through the campaign's ordinary commit and
pull-request delivery like any other edit. Against Quest, `lore link` and `lore unlink` refuse to
write until `LORE_QUEST_ACTOR` and `LORE_QUEST_ACTOR_KIND` are set, plus
`LORE_QUEST_ACCOUNTABLE_HUMAN` for a `delegated-agent` actor (`lore instructions linking`). No
separate Lore preflight gate runs before these commands. On a Backlog-backed repository, ADR-0012's
sole-committer contract still describes what Lore commits.

### Fast lane

The coordinating session delegates scoped work to the `opum-workflow` specialists that the
`CLAUDE.md` Delegation section authorizes. Give each specialist exclusive file scope, and check that
scope against the coordinator's own open branches as well as against the other specialists. The
coordinator alone controls Quest settlement, Lore-managed surfaces, integration, and delivery.

A campaign starts with the `opum-handoff` skill in `init` mode. It inventories
`quest task list --ready`, writes one campaign Story with `lore new story`, couples the tasks with
`lore link`, runs `lore sync` and `lore check`, and enters the first task in the same turn. The
campaign Story is the only campaign document. Quest holds the tasks, so no second queue or tracker
file is kept. Before each dispatch, ground live tasks, dependencies, and the working tree. A finished
wave settles once, recomputes readiness, and continues; it does not create a habitual handover
boundary.

Carry every ready task through implementation, independent review, commit, an authorized `dev` pull
request and merge, Quest settlement, artifact cleanup, and the next newly ready wave. Pending checks
are monitored and first failures receive bounded remediation. A successful wave, PR, merge, cleanup
pass, or subjective preference for a smaller session is not a stop.

### Session cursor and stop contract

The `opum-workflow` plugin's `SessionEnd` and `PreCompact` hooks write the session cursor at
`.claude/handovers/cursor.md`. That path is gitignored. The cursor is restart acceleration only and
is never authoritative. The trust order is the live Quest record and Git repository first, then the
campaign Story's `lore tasks` rollup, then the cursor. Do not hand-write the cursor. Durable
reasoning belongs in a note on the Quest task, which survives a discarded working tree.

A nonterminal run has exactly two exit forms. A decision stop names a real authority boundary or
external blocker plus the one human action needed, asked with `AskUserQuestion`. A session renewal
is reserved for an environment stop or demonstrably unreliable context. It runs `opum-handoff` in
`write` mode after durable state is on the Quest record. The successor starts a new Claude Code
session in `lore-cli`, runs `opum-handoff` in `restore` mode, and continues without reconfirmation.
Once the successor is running, the cursor that launched it is spent and is deleted.

### Branch, isolation, and cleanup hygiene

Work happens on a plain task branch in the primary checkout. A specialist that could run
concurrently with another is dispatched with an explicit `isolation: "worktree"` parameter. Do not
rely on a specialist isolating itself into `.claude/worktrees/`, because that is not reliable. A
specialist dispatched alone needs no isolation parameter.

Cleanup is evidence-driven. Campaign work already represented on `dev` by ancestry or patch
equivalence is safe cleanup. Unique in-scope work is preserved and routed through review and
delivery. Unrelated or decision-dependent work is retained with exact owner, reason, paths, and
cleanup condition. Check a worktree for uncommitted work before removing it. A squash-landed local
branch still needs `git branch -D`, because the safe form refuses a branch whose ancestry the squash
broke. Safe pruning, merged-branch deletion, and clean fast-forwarding proceed independently instead
of being bundled into a request to discard unique dirty changes.

### Evidence and limits

Detailed commands, results, and review findings stay on Quest tasks. The session cursor is not a
record, and archived handovers are non-executable provenance.

Record each gate by tree SHA, command, and result. Reuse it for an identical tree, but rerun it when
a rebase, conflict resolution, or generated rewrite changes the tree. Pure prose gets focused
checks during writing and one final `bun run lore check` plus diff hygiene. Script, skill, and
configuration changes add only their relevant focused checks. A first failure gets diagnosis, one
safe correction, and a rerun; a repeated failure requires independent review or an alternate safe
fix before a pause.

Measure the first five campaigns: zero routine approval prompts after invocation, first edit in the
init turn, at least two concurrent ready tasks when two exist, at most one PR per repository per wave
(and no PR when a wave has no deliverable change), one Quest settlement per wave, one strict Lore
gate per final tree, and no duplicated full suite for an identical tree.
