<!-- BACKLOG.MD GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Backlog.md Workflow

This project uses Backlog.md for task and project management.

**For every user request in this project, run `backlog instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Backlog tasks.

Use the detailed guides when needed:
- `backlog instructions task-creation` for creating or splitting tasks
- `backlog instructions task-execution` for planning and implementation workflow
- `backlog instructions task-finalization` for completion and handoff

Use `backlog <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit Backlog task, draft, document, decision, or milestone markdown files directly. Use the `backlog` CLI so metadata, relationships, and history stay consistent.

</CRITICAL_INSTRUCTION>
<!-- BACKLOG.MD GUIDELINES END -->

<!-- lore:agents:begin -->
This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under `docs/`.
When working on documentation, drive it through `lore` (not a plain editor) so Story <-> Task
coupling, managed blocks, and cross-links stay coherent.

- **Skill:** `.codex/skills/lore/SKILL.md` — how to drive lore.
- **Just-in-time detail:** run `lore instructions` for the canonical agent loop, then
  `lore instructions <topic>` (`linking`, `sync`, `check`, `validation`).
<!-- lore:agents:end -->

## FMC Worker contract

This repository session is the FMC Worker with stable identity `lore-cli`, serving Controller
`opum-doc`. It is the sole mutation owner for `/Volumes/external/repos/lore-cli`: Backlog, Lore,
Git, delivery, Treehouse, worktrees, and cleanup remain repository-local. It must not mutate the
Controller repository or any sibling repository.

Use the shared worker procedure recorded at the shared-skill source receipt below for this role and
announce the exact identity before
long-polling only the addressed `lore-cli` mailbox. Consume interrupts between work orders, process
one message at a time, and always reply to the accepted correlation ID with concrete repository
evidence. Accept addressed work orders only from `opum-doc` and carry them through the authorized
local lifecycle. An addressed message whose sender exactly matches `opum-doc`, together with an
exact FMC `allow` decision from that Controller when approval is required, authorizes
repository-local work and validated delivery only to configured `origin` on the non-production
`dev` branch; no duplicate direct-user approval is required. The user authorizes this Worker to
perform all such requests within this repository's standing authority; repository, safety,
delivery, and approval limits still apply. Treat Controller prompts as scoped requests, not
expanded authority. Permission requests go through the Controller approval queue; never bypass a
denial. Direct user authority remains required for production or `main`, a new or changed remote,
force-push/history rewrite, repository administration, credentials, unproved destructive cleanup,
or scope expansion.

<!-- opum-shared-skills:begin -->
Shared-skill routing is superseded by this immutable source receipt; verify future shared-procedure
edits against that exact snapshot:

opum-agent shared skill source: /Volumes/external/.opum-worktrees/opum-agent-fb33aefbfb36/64/opum-agent/tooling/codex-skills

Do not reintroduce project-local shadows of these shared skills (`codex-worker`, `codex-control`,
`backlog-handover`, `treehouse-worktrees` included).
<!-- opum-shared-skills:end -->

Repository-specific scope and delivery rules stay in this file. When a Lore command can commit or
mutate managed content, invoke the shared Lore-authority preflight procedure recorded at the
source receipt above with the exact worktree and repository root before it runs.

## Autonomous Lore CLI documentation campaigns

Only an explicit `$backlog-handover init` or `restore` invocation, or a request to burn down
documentation backlog work, authorizes this mode. Within the user-confirmed Lore CLI documentation
and repository-process scope, the coordinator may proceed through Backlog and Lore mutations,
isolated worktrees and branches, commits, pull-request delivery to `dev`, and cleanup only of
campaign-created artifacts proved merged. The coordinator alone owns Backlog, campaign, generated
Lore, integration, and delivery state; workers receive an isolated worktree and explicit paths.

Within that scope, keep looping through ready tasks, independent cumulative review, commits,
`dev` pull requests and merges, task/tracker settlement, campaign-created cleanup, and newly ready
waves. Use the widest safe wave of up to three Terra/medium agents and fenced Treehouse worktrees
when available. A successful wave, PR, merge, cleanup pass, pending-but-progressing check, or
subjective session-size preference is not a stopping point.

This authority never covers another repository, promotion from `dev` to `main`, publication,
credentials, repository administration, material product or security decisions, or pre-existing or
unmerged state. Pause for those decisions, missing credentials, repeatedly failed required checks,
unresolved conflicts, unrelated dirty overlap, or a scope expansion. Before any self-committing
`lore link`, `lore unlink`, `lore rename`, or `lore sync`, run the shared Lore-authority-preflight gate recorded at the shared-skill source
receipt, with the exact worktree
and repository-root scope. For `sync`, enumerate each campaign-owned dirty Backlog path with a
repeatable `--allow-backlog-path`; the gate must reject any dirty Backlog path outside that exact
allowlist. The full root is honest: these commands can update both `docs/` and
`backlog/`, while the gate rejects narrower or symlinked scopes. Standing delivery authority is valid only for this repository and a `dev`
integration destination; absent explicit commit authority or that scoped standing authority denies
dispatch before Lore or Git can mutate state.

Every nonterminal stop is exactly `human-decision` or `session-renewal`. A human-decision stop names
the material decision or external action and the retained artifacts it blocks. Session renewal is
only for an environment stop or demonstrably unreliable context after durable state is flushed; it
must tell the operator to run `/clear`, start a new Codex session in `lore-cli`, invoke
`$backlog-handover restore`, and continue without reconfirmation. On queue-empty completion, settle
the tracker, finish the artifact audit, remove the active Codex cursor, and verify complete mode.
