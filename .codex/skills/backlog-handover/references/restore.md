# Restore and execute an autonomous Lore CLI campaign

1. Read the tracker from `active.md`, or the newest incomplete campaign-specific Backlog document.
   When the tracker is a Backlog document, use `backlog doc view <tracker-id> --plain | node
   .codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs` before relying on it; this keeps
   the 200-line/32-KiB budget mechanically enforced without reading Backlog storage directly.
   Ground its live queued/in-flight tasks and dependency closure against branch, exact HEAD, dirty
   paths, worktrees, campaign refs, and locally available ahead/behind facts. Query remote state only
   when authorized delivery needs it. Reconcile stale durable state before dispatch.
2. A task is ready only when eligible, dependencies are Done, required evidence is obtainable, no
   human decision blocks it, and it has no overlap with unrelated or in-flight work. Build conservative
   conflict edges from modified-file metadata, plans, cited concepts, shared Lore surfaces, indexes,
   and repository inspection.
3. Use up to three slots: explorers/sweepers for disjoint reads; normally two isolated writers plus
   one reviewer; three writers only with fully independent budgets. Create all worktrees from one
   pinned `dev` base.

The coordinator alone mutates Backlog, tracker, handover, Lore-generated surfaces, integration, and
remote state. Workers return task id, base/head SHA, changed paths, commands/results, findings,
residual risks, and follow-ups.

Run the execution guide once before wave mutations, record dispatch compactly, then activate and
plan each task before edits. Integrate non-conflicting work serially. Read `delivery.md` when the
first integrated result is ready. At settlement keep task evidence on tasks and one concise tracker
disposition. Carry the wave through independent review, commits, at most one `dev` PR, merge,
integration review, task/tracker settlement, and safe cleanup; none of those intermediate boundaries
ends a run. Recompute readiness and begin the next wave immediately.

Stop only when the queue is empty or one of these nonterminal exit forms applies:

- `human-decision`: an actual `AGENTS.md` pause condition is present and the exact decision or
  blocker is named. Flush durable state, retain affected artifacts with an owner and reason, and tell
  the user the one decision or external action that unblocks the campaign.
- `session-renewal`: the environment must stop or context is demonstrably no longer reliable. Flush
  durable state, write the grounded cursor described by `handover.md`, and explicitly tell the user
  to run `/clear`, start a new session in `lore-cli`, invoke `$backlog-handover restore`, and
  continue without reconfirmation.

A successful wave, merged PR, cleanup pass, routine context growth, or preference for a smaller
session is not a stop condition. If neither nonterminal form applies, keep looping.

When the queue is empty, mark the tracker complete, finish the artifact audit, and remove
`.codex/handovers/active.md`; do not leave a completed campaign as an executable cursor. If any
local provenance must be retained, rewrite it as historical, remove every runnable continuation,
and store it outside the active cursor path. Run
`node .codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs --complete`. A later
invocation selects only an incomplete tracker or initializes a new campaign; it never restores the
closed one.
