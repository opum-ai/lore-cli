# Initialize an autonomous Lore CLI documentation campaign

1. Read non-terminal tasks with one filtered `backlog task list --json` call. Exclude terminal and
   `do-not-activate` history, parent containers whose children own all work, external blockers, and
   material owner decisions. View only candidates and their formal dependency closure.
2. Derive Lore CLI ownership from live task metadata, plans, documentation, references, and focused
   repository inspection. `lore-cli` is the sole eligible root; another repository is a scope
   boundary, not an inferred extension. Read applicable `AGENTS.md`, record `dev`, the pinned base,
   and required gates. Order by dependencies, then priority and ordinal.
3. A bare `$backlog-handover init` confirms every ready agent-resolvable Lore CLI documentation or
   repository-process task. Ask one scope question only when interpretations materially change
   product, security, publication, or destructive state.

Record `Mode: autonomous-docs` and the governing authorization once in a new Backlog campaign
document. Keep it below 200 lines and 32 KiB; detailed evidence belongs on tasks:

```markdown
# Backlog campaign — <scope>
## Contract
- Mode: autonomous-docs
- Scope: lore-cli only
- Queue rule: dependencies, then priority and ordinal
## Repository
| Repository | Task ids | AGENTS authority | Integration base | Required gates |
## Frontier
<counts and one sentence>
## Queue
| Order | Task | Dependencies | State | Wave | Likely paths |
## Resolved
| Task | Wave | Disposition | Evidence pointer |
## Human decisions and blockers
## Wave log
```

Before creating the handover, mechanically verify the new campaign tracker through the Backlog CLI:

```sh
backlog doc view <tracker-id> --plain | node .codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs
```

The audit must pass (at most 200 lines and 32 KiB). Then write `.codex/handovers/active.md`, run the
lifecycle audit, read `restore.md` completely, and continue in the same turn. Initialization is not a
stopping point.
