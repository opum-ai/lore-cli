<!-- What this file is. Read before adding to it. -->
<!--
AGENTS.md is NOT where this repository's rules live. CLAUDE.md is: the fleet
operating block, the repository profile, ownership and the dangerous set.

Two things read this file, and neither is Claude Code, which does not load it:

  1. opum-agent's `assertNoMigrationLaunchFence`, which requires the
     `opum-agent shared skill source: ...` marker line below. It is a substring
     check, so reformatting is safe and dropping the line is not; deleting this
     file as a Codex artifact broke that fence fleet-wide on 2026-08-30.
  2. The `backlog-handover` skill, whose step 2 says to read every applicable
     AGENTS.md and whose SKILL.md:107 calls it "the authority ledger". Two
     sections below are that ledger -- "Repository ownership and delivery scope"
     and "Autonomous Lore CLI documentation campaigns" -- and both NARROW
     authority rather than granting it. Do not delete either as boilerplate.
     Unlike opum-doc's and quest-cli's, they are plain headings rather than
     marker-delimited blocks, so a tool that edits by marker will not see them.

The AUTHORITY LEDGER for this repository is CLAUDE.md's `opum:fleet-operating`
block, section "Ownership", as narrowed by those two sections. Note that this
repository gates `dev`, not `main`; the profile in CLAUDE.md records why, and it
is the fleet's deliberate exception.

Because nothing loads this file automatically, prose written here drifts unseen.
Put new repository rules in CLAUDE.md. Add to this file only what one of the two
consumers above actually reads.
-->

<!-- QUEST WORKFLOW GUIDELINES START -->
<CRITICAL_INSTRUCTION>

## Quest Workflow

This project cut LCLI over from Backlog to Quest as its tracker of record on 2026-09-03
(425 records migrated; digest 1dd84c5eb53d6c76672031e0343dfa4e0f77a5394f8bf0a756bf53c4da3d8640).
`.quest/` is committed and tracked — never gitignore it. `backlog/` no longer exists on disk:
its 297 excluded LORE-family records were all proven non-unique and removed at commit f84f586,
recoverable from git history if ever needed. Do not recreate `backlog/` or write LCLI tasks
there — Quest is the only system of record.

**For every user request in this project, run `quest instructions overview` before answering or taking action.**

Use the overview to decide whether to search, read, create, or update Quest tasks.

Use the detailed guides when needed:
- `quest instructions task-creation` for creating or splitting tasks
- `quest instructions task-execution` for planning and implementation workflow
- `quest instructions task-finalization` for completion and handoff

Use `quest <command> --help` before running unfamiliar commands. Help shows options, fields, and examples.

Do not edit `.quest/tasks/*.json` directly. Use the `quest` CLI so metadata, relationships, and
history stay consistent. Every write needs an explicit actor: `--actor <id> --actor-kind human`
for a human operator, or `--actor-kind delegated-agent --accountable-human <id>` for an agent
session acting on someone's behalf — a missing or wrong `--actor-kind` is rejected, not defaulted.

</CRITICAL_INSTRUCTION>
<!-- QUEST WORKFLOW GUIDELINES END -->

<!-- lore:agents:begin -->
This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under `docs/`.
When working on documentation, drive it through `lore` (not a plain editor) so Story <-> Task
coupling, managed blocks, and cross-links stay coherent.

- **Skill:** `.codex/skills/lore/SKILL.md` — how to drive lore.
- **Just-in-time detail:** run `lore instructions` for the canonical agent loop, then
  `lore instructions <topic>` (`linking`, `sync`, `check`, `validation`, `workspace`).
<!-- lore:agents:end -->

## Repository ownership and delivery scope

This repository session is the sole mutation owner for `/Volumes/external/repos/lore-cli`:
Backlog, Lore, Git, delivery, worktrees, and cleanup remain repository-local. It must not mutate
any sibling repository.

Repository-local work and validated delivery to configured `origin` on the non-production `dev`
branch are within this repository's standing authority; repository, safety, delivery, and approval
limits still apply. Direct user authority remains required for production or `main`, a new or
changed remote, force-push/history rewrite, repository administration, credentials, unproved
destructive cleanup, or scope expansion.

(FMC is retired as this fleet's cross-repository coordination mechanism; the peer-to-peer model
that replaced it, and this repository's fleet-operating rules, live in `CLAUDE.md`. What is above
is this repository's own delivery machinery, which does not depend on FMC existing.)

<!-- opum-shared-skills:begin -->
Shared-skill routing is superseded by this immutable source receipt; verify future shared-procedure
edits against that exact snapshot:

opum-agent shared skill source: /Volumes/external/.opum-worktrees/opum-agent-fb33aefbfb36/64/opum-agent/tooling/codex-skills

Do not reintroduce project-local shadows of these shared skills (`codex-worker`, `codex-control`,
`backlog-handover`, `opum-worktrees` included).
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
waves. Use the widest safe wave of up to three Terra/medium agents and fenced `opum-worktrees` leases
when available. A successful wave, PR, merge, cleanup pass, pending-but-progressing check, or
subjective session-size preference is not a stopping point.

This authority never covers another repository, promotion from `dev` to `main`, publication,
credentials, repository administration, material product or security decisions, or pre-existing or
unmerged state. Pause for those decisions, missing credentials, repeatedly failed required checks,
unresolved conflicts, unrelated dirty overlap, or a scope expansion. Before any self-committing
`lore link`, `lore unlink`, `lore rename`, or `lore sync`, run the shared Lore-authority-preflight gate recorded at the shared-skill source
receipt, with the exact worktree
and repository-root scope. For `sync`, enumerate each campaign-owned dirty tracker path with a
repeatable `--allow-tracker-path`; the gate must reject any dirty tracker path outside that exact
allowlist. `--allow-backlog-path` is the deprecated spelling and still resolves, but the gate's
TRACKER_ROOTS are `backlog` and `.quest`, and this repository has only `.quest` since the
2026-09-03 cutover — an allowlist written in the old spelling against a `backlog/` path that no
longer exists allowlists nothing. The full root is honest: these commands can update both `docs/`
and `.quest/`, while the gate rejects narrower or symlinked scopes. Standing delivery authority is valid only for this repository and a `dev`
integration destination; absent explicit commit authority or that scoped standing authority denies
dispatch before Lore or Git can mutate state.

Every nonterminal stop is exactly `human-decision` or `session-renewal`. A human-decision stop names
the material decision or external action and the retained artifacts it blocks. Session renewal is
only for an environment stop or demonstrably unreliable context after durable state is flushed; it
must tell the operator to run `/clear`, start a new Claude Code session in `lore-cli`, invoke
`$backlog-handover restore`, and continue without reconfirmation. On queue-empty completion, settle
the tracker, finish the artifact audit, remove the active cursor, and verify complete mode.

## Project-level skills: what is here on purpose

This repository carries exactly three project-level skills, and each is here for a reason a reader
should not have to re-derive (LCLI-362). **Nothing else belongs under `.claude/skills/` or
`.codex/skills/`.**

- **`.claude/skills/lore/SKILL.md` and `.codex/skills/lore/SKILL.md` are two deliberate copies, and
  collapsing them would be a regression.** This repository *generates* both:
  `src/core/agent-bridge.ts` owns `SKILL_REL_PATH = ".claude/skills/lore/SKILL.md"` and
  `src/core/codex-bridge.ts` owns `CODEX_SKILL_REL_PATH = ".codex/skills/lore/SKILL.md"`. The prose
  differs because it addresses different agents, and each entry document is written by its own
  bridge — so CLAUDE.md citing `.claude/...` while AGENTS.md cites `.codex/...` is correct, not
  drift. Change either through `lore agents` / `lore init --codex`, never by hand.
- **`.claude/skills/handover/SKILL.md` shadows nothing.** There is no user-level `handover` package,
  so this is the only copy. It is distinct from the user-level `backlog-handover` skill.
- **No project-level copy of a shared skill.** `backlog-handover`, `codex-worker`, `codex-control`,
  and `opum-worktrees` resolve to their user-level packages. A project-level copy is a silent fork:
  nothing announces the substitution, and a partial copy — one carrying `SKILL.md` without the
  `scripts/` and `references/` the procedure invokes — fails only once a session is already relying
  on it. Empty leftover directories count: git does not track them, so they survive every
  diff-based review and are visible only in a filesystem listing.

<!-- quest:agent-instructions:begin -->
# Quest agent instructions

This project uses Quest CLI 0.3.1 for tracker operations. Run `quest manifest --json` to discover the supported command contract. Use `quest instructions --json` for the current versioned protocol. For Backlog tracker cutover, run `quest migration backlog preview --source <project> --json`, review its digest and mappings, then apply it with `quest migration backlog apply --source <project> --digest <digest> --actor <id> --actor-kind human --json`. Quest writes require an explicit actor declaration; do not edit Quest-authored records directly. CI should run `quest agents --check --require-installed`: current instructions exit 0, while missing, drifted, or malformed managed instructions exit 6. Quest does not retry write conflicts automatically; callers should read the latest task state and perform their own bounded retry when a command returns conflict/exit 5.
<!-- quest:agent-instructions:end -->
