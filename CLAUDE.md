
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

<!-- opum:fleet-operating:begin -->

@~/.claude/opum-fleet-operating.md

<!-- opum:fleet-operating:end -->

<!-- lore:agents:begin -->
This repo uses **lore** — an OKF-native documentation CLI — for the docs bundle under `docs/`.
When working on documentation, drive it through `lore` (not a plain editor) so Story <-> Task
coupling, managed blocks, and cross-links stay coherent.

- **Skill:** installed from the `opum-lore` Claude Code plugin, not this repository — how to drive lore.
- **Just-in-time detail:** run `lore instructions` for the canonical agent loop, then
  `lore instructions <topic>` (`linking`, `sync`, `check`, `validation`, `workspace`).
<!-- lore:agents:end -->

<!-- quest:agent-instructions:begin -->
# Quest agent instructions

This project uses Quest CLI 0.4.0 for tracker operations. Run `quest manifest --json` to discover the supported command contract. Use `quest instructions --json` for the current versioned protocol. For Backlog tracker cutover, run `quest migration backlog preview --source <project> --json`, review its digest and mappings, then apply it with `quest migration backlog apply --source <project> --digest <digest> --actor <id> --actor-kind human --json`. Quest writes require an explicit actor declaration; do not edit Quest-authored records directly. CI should run `quest agents --check --require-installed --target claude`: current instructions exit 0, while missing, drifted, or malformed managed instructions exit 6. Quest does not retry write conflicts automatically; callers should read the latest task state and perform their own bounded retry when a command returns conflict/exit 5.
<!-- quest:agent-instructions:end -->
