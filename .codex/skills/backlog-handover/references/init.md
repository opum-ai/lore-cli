# Initialize an autonomous Lore CLI documentation campaign

Inventory non-terminal LCLI tasks and their dependency closure once. Exclude `do-not-activate`
history, parent containers without independent work, external blockers, and material owner,
publication, security, release, or repository-admin decisions. A bare `init` confirms all ready,
agent-resolvable Lore CLI documentation and repository-process work.

Record one compact tracker through `backlog doc create` and `backlog doc update`: mode, selected
Lore CLI scope, pinned non-production integration base, required gates, queue, frontier, concise
settlement rows, and human blockers. Keep it below 200 lines and 32 KiB; task notes own evidence.
Mechanically audit the tracker from the Backlog CLI before relying on it:

```sh
backlog doc view <tracker-id> --plain | node .codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs
```

Write the sole active cursor, audit it, then read `restore.md` and execute the first live wave in
the same turn. Initialization is not a stopping point.
