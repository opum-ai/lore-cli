---
name: backlog-handover
description: Drive and resume multi-session Backlog.md campaigns in this repository using a confirmed queue, live dependency and file-conflict checks, grounded git state, and paste-ready handovers. Use when the user asks to initialize, continue, restore, inspect, or hand over a backlog campaign; burn down multiple Backlog tasks; take the next safe task; or preserve unfinished campaign state for another session.
---

# Backlog Handover

Continue a Backlog.md campaign without trusting stale session memory. Treat Backlog tasks as
the lifecycle system of record, a Backlog document as the campaign queue and journal, and the
active handover as a disposable restart pointer.

This repository keeps active handovers under `.claude/handovers/` for continuity with its
existing campaign history even when Codex drives the work.

## Start every invocation

1. Run `backlog instructions overview` before answering or acting.
2. Read and follow every applicable `AGENTS.md`.
3. Select a mode from the request:
   - `init`: inventory work and establish a new confirmed campaign.
   - `restore`: reconcile live state and continue the current campaign.
   - `write`: preserve grounded state because work remains unfinished.
   - `status`: report campaign state without changing it.
4. Let an explicit mode win. Infer clear natural-language intent. Use `status` for a genuinely
   ambiguous invocation because it is the only read-only mode.

Before executing any task, run `backlog instructions task-execution`. Before checking
acceptance criteria, writing a final summary, or moving a task to `Done`, run
`backlog instructions task-finalization`.

## Non-negotiable rules

- Use `backlog task ...` and `backlog doc ...` for every Backlog read and mutation. Never edit
  files under `backlog/` directly. Prefer `--json` for computation and `--plain` for review.
- Read help before using an unfamiliar Backlog command. Remember that replacement flags such as
  dependency, label, reference, documentation, and modified-file fields replace their entire
  collection; preserve existing values when updating them.
- Treat live task status, dependencies, acceptance criteria, and notes as authoritative. The
  campaign document supplies confirmed priority, conflict hints, and history; it never overrides
  a live task.
- Recompute readiness and conflicts on every restore and after every completed wave. Never persist
  a promised next wave.
- Preserve unrelated dirty files and existing worktrees. Stop before touching overlapping user
  changes and ask for direction.
- Use `apply_patch` for repository source edits. Route changes under `docs/` through the `$lore`
  skill and Lore CLI. Backlog documents are not Lore documents and remain Backlog CLI-owned.
- Do not create tasks, update the campaign document, commit, push, open or merge a PR, delete a
  branch/worktree, or publish anything concurrently. Serialize shared-state mutations.
- Do not infer permission to commit, push, open PRs, merge, delete, publish, or change remote
  state. Perform only the delivery actions already authorized by the user and governing
  instructions.
- Do not expose secrets, tokens, credentials, private URLs, or unredacted owner metadata in task
  notes, tracker documents, logs, or handovers. Active handovers may name the local repository
  path when needed for a paste-ready prompt; redact machine-specific paths before archiving them
  into tracked history.

## Durable state model

Use three layers, in this order of authority:

1. **Backlog tasks**: status, formal dependencies, acceptance criteria, plans, evidence, modified
   files, and completion summaries.
2. **Campaign document**: user-confirmed queue order, scope, coarse clusters, conflict hints,
   wave membership, settlement history, and human-only/deferred items. Locate it with
   `backlog doc list --plain` and read it with `backlog doc view <id> --plain`.
3. **Active handover**: a short restart prompt plus verified git/worktree state and unfinished
   stages. It accelerates restore but is never authoritative.

Update a campaign document only with `backlog doc update <id> --content <complete-body>`. Read the
current document immediately before replacement, preserve unrelated history, and write at most
twice per wave: dispatch marking and settlement.

## Execution model

Default to a sequential wave of one task. This is the safe path when the user did not explicitly
authorize subagents or when governing instructions disallow them.

Use a bounded parallel wave only when the user or applicable repository instructions explicitly
authorize subagents and the environment supports isolated workers:

- The coordinator computes readiness/conflicts, creates worktrees from one pinned base, owns the
  campaign document, and serializes delivery.
- Assign one existing task and one worktree to each worker. A worker may update only its assigned
  task through the Backlog CLI; it must not create tasks, update the campaign document, merge,
  remove worktrees, or touch sibling work.
- Use an independent reviewer when authorized capacity exists. Otherwise run a clearly labeled
  adversarial self-review after verification; never claim it was independent.
- Bound the wave by available agent slots and disk capacity. Uncertainty about file overlap
  creates a conflict edge and reduces parallelism.

For parallel worktrees, create every branch from the same verified base SHA. Keep worktrees on the
same filesystem as the repository, use isolated dependencies, and retain each worktree until its
task is reviewed and its disposition is known. Never use `git stash` across sibling worktrees.

## Init mode

### 1. Inventory

Read non-terminal tasks with a filtered `backlog task list ... --json`, then view every candidate
with `backlog task view <id> --json`. Classify each task as:

- agent-resolvable now;
- blocked by formal dependencies or external state;
- requires a material product, security, release, or repository-admin decision;
- deferred or outside the campaign scope.

Do not alter tasks during inventory. Exclude parent containers whose executable work belongs to
subtasks unless the parent itself has independent acceptance criteria.

### 2. Propose and confirm

Propose a scope and stable priority order. Prefer low-risk, high-information work first while
respecting formal dependencies. Explain that order is only a tie-break for live wave construction.

Require explicit user confirmation before creating the tracker unless the request already contains
an unambiguous confirmed scope and order. Do not manufacture a queue from vague intent.

### 3. Create the campaign record

Create a uniquely titled Backlog document with `backlog doc create`, then populate it through
`backlog doc update`. Preserve this structure:

```markdown
# Backlog campaign tracker — <scope or round>

## Scope and order confirmation
- Scope: ...
- Confirmed by the user: "..." on <date>
- Order is a tie-break; readiness is recomputed live.

## Frontier
Informational snapshot only; never a promised next wave.

## Queue
| Order | Task | Cluster | Formal dependencies | State | Wave | Likely files | Note |

## Resolved
| Task | Date/wave | Evidence and disposition |

## Not queued — blocked, deferred, or human decision required
- <task>: <objective reason>

## Wave log
- <date> — <event and grounded evidence>
```

Verify `.claude/handovers/` is ignored. Do not disturb existing completed campaign documents.
Write the first active handover and stop; `init` establishes state but does not execute a task.

## Restore mode

### 1. Locate and ground

Locate the newest incomplete campaign document and the matching active handover. If no campaign
document exists, recommend `init` and stop. If the latest campaign is complete, do not reopen it;
require a new confirmed round.

Verify rather than remember:

- current branch and exact HEAD;
- `git status --short --branch` and relevant diffs;
- ahead/behind state when locally available;
- `git worktree list --porcelain`;
- campaign branches and, when authorized and relevant, their PR state;
- every queued or in-flight task via Backlog CLI;
- the current campaign document body.

Produce a compact drift table: handover/tracker claim, live observation, and required reconciliation.
Do not fetch or mutate remote refs merely to answer `status`; if remote truth is unavailable, state
that limitation.

### 2. Reconcile before new work

Reconcile completed-but-unrecorded work into the owning task first, then update the campaign
document through the CLI. Resume a legitimate in-flight branch/worktree from its last verified
stage. Flag orphan branches, worktrees, or PRs with no campaign row; never delete them silently.

### 3. Build the live ready set

A queued task is ready only when:

- its live status is eligible for work;
- every formal dependency is `Done`;
- it is not blocked, deferred, or awaiting a human decision;
- it does not overlap unrelated dirty work or another in-flight task;
- its required tools and evidence can be obtained in the current environment.

Detect dependency cycles and remove only cycle members from scheduling; continue over the acyclic
remainder. Build a conservative conflict graph from each task's modified-file metadata, plan,
references, cited paths, likely generated files, and relevant repository inspection. Same cluster
is a conflict hint; different clusters are not proof of independence.

### 4. Execute one wave

Mark actual wave membership in the campaign document immediately before starting. For each task:

1. Run the task-execution guide and view the live task.
2. Mark it `In Progress`, assign it, and record the researched plan through `backlog task edit`
   before source edits.
3. Implement only the approved scope. Preserve unrelated changes and keep all Backlog mutations
   in the CLI.
4. Run focused verification and the project-required gates in proportion to risk. Record exact
   commands, results, environment limitations, and residual risks in task notes.
5. Run the task-finalization guide. Review acceptance criteria individually and perform the
   independent or adversarial review required by the execution model.
6. Mark criteria and `Done` only when objective evidence and the required delivery state exist.
   Otherwise leave the task `In Progress` and record the precise blocker or failed evidence.

If multiple branches are authorized for delivery, land them strictly one at a time. Rebase each
against the current integration branch, re-run affected verification after the rebase, then perform
only the authorized push/PR/merge operations. After a multi-task wave lands, review the cumulative
wave diff for cross-task contract conflicts.

### 5. Settle and decide whether to continue

Update the campaign document once with resolved tasks, evidence, review disposition, exact SHAs
when they exist, blocked items, and a single wave-log entry. Recompute the frontier.

Stop between waves when any of these holds:

- the queue is empty;
- the user's task/wave budget is exhausted;
- a material decision or new authority is required;
- verification or review fails repeatedly;
- remaining work conflicts with user changes or in-flight work;
- the session has accumulated enough context that a grounded handover is safer.

Otherwise recompute readiness and begin another wave. Never carry forward a preselected wave.

### 6. Close the wave without leaving repository debris

Before declaring a wave or campaign clean, give every repo-visible artifact an explicit
disposition:

- **Delivered**: committed and integrated into the verified integration branch.
- **Local-only by design**: ignored restart state such as the active handover. This is the only
  normal campaign artifact that may remain solely in a working checkout.
- **Retained intentionally**: an undelivered branch, worktree, or lease with its exact owner,
  reason, last verified state, and missing authority recorded in both the tracker and handover.

Do not accumulate tracker, task, skill, configuration, or generated-document mutations on a
long-lived stale primary checkout. Create a clean coordinator or reconciliation branch from the
verified integration SHA and use each artifact's governing tool to recreate or merge unique state.
When the primary is dirty and behind integration, classify each path by blob or content comparison:
`git status` alone cannot distinguish unique work from an older copy of an already-integrated file.

After authorized delivery, perform a serial closure audit:

1. Verify the exact merged PR head and integration SHA.
2. Recheck the primary checkout, campaign tracker, affected tasks, active handover, local and remote
   feature refs, every registered worktree, and every Treehouse lease.
3. For each orphan candidate, verify clean status and either merged ancestry or patch equivalence
   before deleting the exact branch/worktree target. Never infer safety from an old branch's large
   tree diff against current integration.
4. Treat a Treehouse return as lease release, not physical worktree deletion. Reusable pool slots
   are infrastructure; prune only stale or orphan registrations/directories, with exact targets and
   the required authority.
5. If cleanup authority is missing, retain the artifact and record why. Do not describe the wave as
   clean or complete while unexplained branches, worktrees, leases, or repo-visible changes remain.

Tracker settlement is itself deliverable state. If final cleanup facts occur after the main merge,
deliver a small follow-up tracker reconciliation rather than leaving the settlement only in a
dirty checkout.

## Write mode

Flush durable facts before writing the handover:

1. Update affected tasks through the Backlog CLI with plans, evidence, blockers, and honest status.
2. Update the campaign document through the Backlog CLI with the live frontier and completed wave
   history.
3. Re-run the grounding checks from Restore mode.

Write `.claude/handovers/HANDOVER-<UTC-date>-backlog-campaign.md` with:

```markdown
# Handover — <campaign goal>

**Grounded against**: <branch @ full SHA; clean/dirty; ahead/behind or unknown>
**Tracker**: <Backlog document id and title>

## Paste-ready prompt
Continue this backlog campaign in <repo path>. Run `backlog instructions overview`,
then use `$backlog-handover` in restore mode with tracker <id>. Recompute readiness live.
<Current authorization boundaries and unfinished stage details.>

## Campaign state
- Resolved / in flight / blocked / ready counts

## In-flight work
| Task | Branch/worktree | Last verified stage | Evidence or blocker |

## Critical constraints
- <non-obvious rules and environment limitations>

## Do not repeat
- <failed approach and observed failure>
```

Include only verified facts. Name every unfinished task's branch/worktree and last completed stage.
Do not promise the next wave. Archive an older same-topic handover only after removing secrets and
machine-specific paths from the tracked copy; use a collision suffix rather than overwriting history.

## Status mode

Remain read-only after the mandatory overview command. Report:

- campaign document ID/title and whether it is active or complete;
- resolved, in-flight, blocked/human, and ready-now counts;
- formal dependency and file-conflict blockers;
- active handover path and grounding SHA;
- current branch, HEAD, dirty paths, ahead/behind state if known;
- campaign branches, worktrees, and authorized-to-query PR state;
- drift and the single safest next action.

Several branches/worktrees may be legitimate during an explicitly authorized parallel wave. Treat
an unmatched branch/worktree/PR, not multiplicity by itself, as the anomaly.

## Failure handling

- Missing `backlog` or an uninitialized Backlog project: stop and report the exact setup gap.
- Dirty primary checkout: allow `status` and `write`; do not begin overlapping implementation.
- Dirty stale primary with authorized reconciliation: classify paths against the verified
  integration tree, preserve unique state through governing tools on a clean branch, then reset
  only after that branch is integrated.
- Stale handover: trust live git and Backlog state, reconcile, then replace the stale claim.
- Backlog mutation conflict: reload the task/document and retry once serially; never edit markdown
  to bypass the CLI.
- Unavailable subagents: reduce to a sequential wave and label self-review honestly.
- Failed tests or incomplete evidence: keep the task non-terminal, record the failure, and hand over.
- Missing delivery authority: stop at the verified local state and request the specific permission
  needed; do not infer it from the campaign's existence.

End every mode with a concise result, current queue counts, unresolved limitations, and either the
next safe command or the exact user decision required.
