# Status and handover

## Status mode

Stay read-only after the mandatory Backlog overview. Ground the active tracker, queued and in-flight
tasks, branch/worktree state, and lifecycle audit. Report resolved, in-flight, blocked/human, and
ready counts plus one next action. Do not fetch merely for status.

## Write mode

Write only for a named human decision/blocker or a session renewal forced by an environment stop or
context that is demonstrably no longer reliable—not a successful wave, merged PR, cleanup pass, or
subjective context-size preference. Classify the stop as exactly one of `human-decision` or
`session-renewal`.
Flush task and compact tracker facts through Backlog, then mechanically audit the tracker before
replacing `.codex/handovers/active.md`:

```sh
backlog doc view <tracker-id> --plain | node .codex/skills/backlog-handover/scripts/audit-campaign-tracker.mjs
```

It must be at most 200 lines and 32 KiB. Keep the handover below 120 lines and 16 KiB:

```markdown
# Handover — <campaign>
**Lifecycle**: executable-current
**Grounded against**: repository `lore-cli`; branch `<exact branch>`; SHA `<full SHA>`; worktree `<absolute path>`; <dirty/ahead state>
**Tracker**: <id and title>
**Mode**: autonomous-docs
**Stop class**: <human-decision | session-renewal>
## Paste-ready prompt
Run `/clear`, start a new session in `lore-cli`, then use `$backlog-handover restore`. Continue the
persisted campaign and tracker without reconfirmation; recompute readiness live.
## State
- Resolved: <count>
- In flight: <count>
- Blocked: <count>
- Ready: <count>
## In flight
| Task | Worktree/branch | Last verified tree and stage | Blocker or next action |
## Retained artifacts
| Artifact | Owner | Reason | Cleanup condition |
## Decision required
<Exact decision/blocker for human-decision; `None — session renewal` otherwise.>
## Next action
<One exact action. For session-renewal, repeat `/clear`, new lore-cli session, and
`$backlog-handover restore`; for human-decision, name the user's one required action.>
## Exceptions
```

The lifecycle audit accepts only this top-level canonical grounding grammar and compares branch,
SHA, and normalized absolute worktree exactly. It ignores fenced code and HTML comments as evidence,
rejects case-variant active cursor names and duplicate task rows, and normalizes Markdown formatting
when searching archives for runnable continuation signals. Historical cursors also reject encoded
HTML entities rather than guessing whether rendered text is executable. It also rejects missing queue counts, stop classification, artifact
disposition, exact next action, or incomplete session-renewal language. After writing a
`human-decision` cursor, the final response leads with the decision required. After writing a
`session-renewal` cursor, the final response leads with the `/clear` and restore sequence. Never say
only “continue,” “context is large,” “start a new session,” or “see handover.”

Historical handovers use the historical marker, omit the prompt, and contain no imperative or
`$backlog-handover` continuation text. After grounding live state, run the lifecycle audit with all
expected values so a well-formed but stale cursor cannot pass:

```sh
node .codex/skills/backlog-handover/scripts/audit-handover-lifecycle.mjs \
  --expect-tracker <doc-id> --expect-sha <worktree-head> --expect-branch <branch> \
  --expect-worktree <absolute-path> --expect-state <resolved,in-flight,blocked,ready>
```

Do not report a handover written until this grounded invocation passes.
