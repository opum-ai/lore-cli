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

## Autonomous Lore CLI documentation campaigns

Only an explicit `$backlog-handover init` or `restore` invocation, or a request to burn down
documentation backlog work, authorizes this mode. Within the user-confirmed Lore CLI documentation
and repository-process scope, the coordinator may proceed through Backlog and Lore mutations,
isolated worktrees and branches, commits, pull-request delivery to `dev`, and cleanup only of
campaign-created artifacts proved merged. The coordinator alone owns Backlog, campaign, generated
Lore, integration, and delivery state; workers receive an isolated worktree and explicit paths.

This authority never covers another repository, promotion from `dev` to `main`, publication,
credentials, repository administration, material product or security decisions, or pre-existing or
unmerged state. Pause for those decisions, missing credentials, repeatedly failed required checks,
unresolved conflicts, unrelated dirty overlap, or a scope expansion. Before any self-committing
`lore link`, `lore unlink`, `lore rename`, or `lore sync`, run the shared
`.codex/skills/backlog-handover/scripts/lore-authority-preflight.mjs` gate with the exact worktree
and affected path. Standing delivery authority is valid only for this repository and a `dev`
integration destination; absent explicit commit authority or that scoped standing authority denies
dispatch before Lore or Git can mutate state.
