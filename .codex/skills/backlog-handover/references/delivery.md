# Batch delivery and validation

Record each gate as `<repository> <tree SHA> <command> <result>`. Reuse it only when the exact tree
is unchanged; a rebase, conflict resolution, generated rewrite, or different merge tree invalidates
the affected evidence. A new commit object with the same tree does not.

- Pure prose: focused validation while writing, then one cumulative `lore sync`, `lore validate
  --strict`, `lore check --strict`, and `git diff --check` on the final wave tree.
- Lore coupling or managed blocks: the coordinator performs coupling/sync before strict gates.
- Skills, configuration, scripts, and executable examples: add focused parsers/tests.
- Cross-repository contracts or executable behavior: run proportionate owner tests, never a full
  suite twice on an identical tree.

Integrate reviewed work serially into one wave branch, review the cumulative diff, and deliver at
most one PR to `dev` for this repository per wave under the authorized contract. If `dev` moved,
rebase/reconstruct from its verified head and rerun only invalidated gates. A first check failure
gets one safe remediation and rerun; after a repeated failure seek independent review or an alternate
safe fix, then pause only if it remains unresolved.

Before settlement, mechanically audit the campaign tracker via `backlog doc view <tracker-id> --plain
| node .codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs`; it must be at most 200
lines and 32 KiB. After merged-head and integration-tree verification, remove only campaign-created
merged branches and disposable worktrees. Then audit the primary checkout, campaign and remote
feature refs, registered worktrees, reusable Treehouse leases, active cursor, and task/tracker state.
Classify each artifact as delivered, local restart state, retained with exact owner/reason/cleanup
condition, reusable infrastructure, or safe campaign-created cleanup. Never infer deletion safety
from age, naming, or a clean status alone; require merged ancestry or patch equivalence. Settle tasks
and the one compact tracker once per wave, recompute readiness, and continue the loop; retain and
record any exception instead of silently deleting it.

For a dirty campaign worktree, compare every changed path and resulting content with current `dev`:

1. If the work is already represented on `dev` by ancestry or patch equivalence, treat it as a
   campaign-created merged artifact and clean it without asking for a discard decision.
2. If the work is unique and in scope, preserve it on an owned recovery branch, attach it to the
   live task or a searched non-duplicate follow-up, run review and delivery, then clean it.
3. If the work is unique but unrelated or requires a material intent decision, retain it with its
   exact paths, owner, reason, and cleanup condition. Ask only for that decision if it blocks the
   queue; continue all independent work first.

Do not bundle safe pruning, merged-branch deletion, lease hygiene, or a clean fast-forward into a
broad request to discard unique changes. Execute independently authorized housekeeping separately.
On queue-empty completion, remove the active cursor and run the lifecycle audit with `--complete`
before reporting the campaign closed.
