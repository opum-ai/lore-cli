# Restore and execute

Ground the active tracker against live LCLI task state, the selected Lore CLI worktree, its
integration branch, dirty paths, worktrees, and required gates. When the tracker is a Backlog
document, run `backlog doc view <tracker-id> --plain | node
.codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs` before relying on it. Tracker and
handover claims never override live facts. Build readiness from eligible status, completed
dependencies, obtainable evidence, no human decision, and no file or generated-surface conflict.

The coordinator owns Backlog, the tracker, active handover, Lore-managed/generated surfaces, Git
integration, and delivery. Four specialized roles share at most three concurrent slots:
explorers/sweepers for discovery; usually two isolated writers and a reviewer; three writers only
with independent explicit path budgets.
Dispatch the widest safe wave from one pinned base, settle once, recompute, and continue. Workers
return task id, base/head, changed paths, checks, risks, and follow-ups; they do not mutate shared state.
