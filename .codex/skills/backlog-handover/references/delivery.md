# Batch delivery and validation

Key every gate by Lore CLI repository, tree SHA, command, and result. Reuse it only for an identical
tree; rebase, conflict resolution, or generated rewrite invalidates it. Pure prose gets focused
checks while writing plus one cumulative `lore sync`, strict validation/check, and diff hygiene per
final wave tree. Skills, configuration, and scripts add focused tests; do not duplicate a full suite
on the same tree.

Under the repository's selected autonomous authority, integrate reviewed work serially and deliver
at most one Lore CLI PR to `dev` per wave. A wave
with no deliverable change may settle without a PR. Never promote to production,
publish, or remove pre-existing/unmerged state. On a failed gate diagnose, make one safe correction,
and rerun only invalidated evidence; after a repeated failure and independent review/alternate fix,
pause. The coordinator settles tasks and tracker once per wave and cleans only campaign-created,
proved-merged branches/worktrees.

Before settlement, audit the tracker with `backlog doc view <tracker-id> --plain | node
.codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs`; it must remain within 200 lines
and 32 KiB.
