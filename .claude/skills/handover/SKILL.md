---
name: handover
version: "0.9.1-lore"
description: "Write or restore session handovers. Write mode: flush durable facts into the system of record (Backlog tasks, docs/, CHANGELOG, auto-memory) first, then write a grounded handover with a paste-ready continuation prompt to .claude/handovers/. Restore mode: verify the handover against live ground truth (git/PRs/Backlog), reconcile drift, archive the consumed handover, and continue. Use when ending a session with pending work, when asked to 'write a handover', or when resuming from a prior session's handover."
disable-model-invocation: false
---

# Handover Skill (lore)

Write or restore session handovers. Input: `$ARGUMENTS`

Adapted for lore from the evolv-coder-kit handover skill: ECK statusline, primitive,
and `tracker:*` dependencies are replaced with lore's **Backlog.md CLI**, the **OKF
docs bundle** under `docs/`, and the project **auto-memory** (`MEMORY.md`). Pairs with
the `context-recovery.sh` (SessionStart) and `pre-compact.sh` (PreCompact) hooks in
`.claude/hooks/`.

---

## Usage

```bash
/handover                  # Write mode — handover for the current session's pending work
/handover write <topic>    # Write mode with an explicit topic slug
/handover restore          # Restore mode — newest manual handover
/handover restore <file>   # Restore a specific handover (filename or topic substring)
/handover list             # List active + recently archived handovers
```

Mode detection: a `restore` / `list` keyword in `$ARGUMENTS` selects the mode; anything
else (including empty) is **write** mode, with remaining words used as the topic.

---

## Conventions

| Kind                | Location             | Pattern                          | Tracked        |
| ------------------- | -------------------- | -------------------------------- | -------------- |
| Active (manual)     | `.claude/handovers/` | `HANDOVER-YYYY-MM-DD-{topic}.md` | No (gitignored)|
| Auto (PreCompact)   | `.claude/handovers/` | `HANDOVER-YYYY-MM-DDTHHMMSSZ.md` | No (gitignored)|
| Consumed/superseded | `archive/handovers/` | `HANDOVER-YYYY-MM-DD-{topic}.md` | Yes            |

- `{topic}` is kebab-case; Backlog keys uppercase (e.g. `HANDOVER-2026-06-21-LORE-10-config.md`).
- **One active handover per topic** — writing a new one on the same topic archives the old one.
- Only `.claude/handovers/` is scanned by `context-recovery.sh` at session start, and only
  the auto-snapshot pattern is rotated by `pre-compact.sh` (manual handovers are never
  auto-deleted). **Never** write handovers to the repo root or `docs/`.

---

## Write Mode

### Stage W1 — Gather ground truth

Collect — do NOT trust memory; verify each with a command:

1. **Git**: current branch + HEAD SHA (`git rev-parse --abbrev-ref HEAD; git rev-parse HEAD`),
   uncommitted changes (`git status --porcelain`), unpushed commits.
2. **PRs**: open PRs touched this session (`gh pr list`, `gh pr view <n>`). Note stacked-PR
   bases and the required merge order.
3. **Backlog**: tasks touched or blocking — `backlog task view LORE-N --plain` (status, ACs,
   what remains); `backlog task list --plain` for the active set. (Reads only; never hand-edit
   `backlog/**`.)
4. **CI** if relevant: `gh pr checks <n>` / `gh run view <id>` — note that check results can
   lag the latest push.

### Stage W2 — Update the system of record FIRST

Durable facts belong in the document that owns them, not the handover. Flush before writing:

| Fact type                          | Lore system of record                                              |
| ---------------------------------- | ------------------------------------------------------------------ |
| Implementation decisions, gotchas  | Backlog task notes — `backlog task edit LORE-N --append-notes "…"` |
| Acceptance evidence                | Backlog ACs — `backlog task edit LORE-N --check-ac N` + notes      |
| Architecture / design facts        | The owning OKF doc under `docs/` (ADR, reference, spec)            |
| Task / issue state                 | Backlog task — `--append-notes` / `--comment` / status            |
| Release-visible changes            | `CHANGELOG.md` (Unreleased)                                        |
| Reusable cross-session learnings   | Project auto-memory (`MEMORY.md` + a memory file), not the handover|

Only update documents that actually have new facts. Use the `backlog` CLI for every Backlog
write. Commit doc updates per lore conventions (Conventional Commits, `LORE-N` scope, and the
`Co-Authored-By: Claude Opus 4.8 (1M context)` trailer) when on a feature branch that will
land; otherwise note the uncommitted state in the handover. Lore ships work as a feature
branch + PR into `dev`, and the user reviews and merges — so a handover usually hands off an
**open PR**, not merged work.

### Stage W3 — Write the handover

Path: `.claude/handovers/HANDOVER-{YYYY-MM-DD}-{topic}.md` (today's date, UTC).
If an active handover for the same topic exists, move it to `archive/handovers/` first.

Template — omit sections that would be empty rather than padding them:

```markdown
# Handover — {one-line goal} ({LORE-N keys})

**Date**: {YYYY-MM-DD} | **Grounded against**: {repo: SHA} | **Backlog**: {LORE-N, …}

## Paste-ready prompt for the next session

​```
{Exact prompt to paste: the command or task, locked decisions, execution order,
what to trust. Written so a fresh session needs nothing else.}
​```

## State

| Item                  | Status                             |
| --------------------- | ---------------------------------- |
| {PR #/LORE-N/branch}  | {merged SHA / open / blocked-on-X} |

## Next steps

1. {ordered, concrete, with file:line / PR # / LORE-N references}

## Critical context / traps

- {non-obvious constraints, ordering requirements, environment traps}

## Do not repeat

- {failed approaches: "tried X, failed because Y"}

## System of record updated

- {doc / task → what was flushed there}
```

Content rules (enforced):

- **No invented content** — every SHA/PR/status verified in W1. A gap is stated as a gap.
- **Failed approaches are mandatory** when any approach failed this session.
- Keep it pointer-dense and short; the system of record holds the detail.
- No secrets. The file is gitignored — never copy machine/env names into anything committed or posted.

### Stage W4 — Confirm

Output: the handover path, topic, one-line goal, the system-of-record documents updated, and a
reminder that `context-recovery.sh` will surface it at the next session start
(`/handover restore` to resume).

---

## Restore Mode

### Stage R1 — Locate

- Explicit arg → match by filename or topic substring in `.claude/handovers/`.
- No arg → newest `HANDOVER-????-??-??-*.md` (manual). If none, newest auto snapshot
  `HANDOVER-*Z.md` (lower fidelity — say so).
- Nothing found → check `archive/handovers/` for a recent match and report; STOP.

### Stage R2 — Verify ground truth (drift check)

The handover reflects when it was written. Re-verify every grounded claim before acting:

1. Repo SHAs: has `dev` (or the named branch) moved past the grounding SHA? (`git fetch` + compare)
2. PRs: still open? merged by someone else? new review comments? did stacked bases retarget? (`gh pr view`)
3. Backlog: task statuses changed? (`backlog task view LORE-N --plain`)
4. CI/checks: re-check live state where the handover asserts it (`gh pr checks <n>`).

Produce a short drift table: `claim → handover said → now`. If drift invalidates the plan
(e.g., PR already merged), adapt the next steps and say so — do not execute stale instructions.

### Stage R3 — Reconcile the system of record

If drift or completed-but-unrecorded work is found, update the owning documents (same table as
W2) so the system of record is current before new work starts.

### Stage R4 — Continue

Execute the handover's paste-ready prompt / next steps, adjusted for drift — honoring its
locked decisions and traps. This is the main body of the session.

### Stage R5 — Archive on consumption

When the handover's work is **complete or superseded**:

1. `mkdir -p archive/handovers && mv .claude/handovers/{file} archive/handovers/{file}`
   (rename to convention if needed).
2. Commit per lore conventions (`docs: archive consumed handover {topic}` or
   `chore(LORE-N): …`, with the Claude co-author trailer). Branch hazard: check
   `git branch --show-current` first; if the checkout is not on a branch that will land,
   commit on the appropriate feature branch or note the uncommitted state.
3. If the work is NOT complete at session end, do not archive — write a fresh handover
   (Write mode), which supersedes and archives this one.

---

## List Mode

Show two tables: active (`.claude/handovers/`, split manual vs auto) and the 10 newest in
`archive/handovers/`. Flag convention violations (wrong pattern, handovers at repo root or in
`docs/`) with the canonical fix.

---

## Error Handling

| Condition                                    | Behavior                                                              |
| -------------------------------------------- | -------------------------------------------------------------------- |
| No pending work to hand over (write mode)    | Say so; offer to record a session summary on the relevant Backlog task (`backlog task edit LORE-N --comment "…"`) |
| Ground-truth command fails (git/gh/backlog)  | Record the gap explicitly in the handover — never substitute memory  |
| Restore target ambiguous (multiple matches)  | List matches, ask the user to pick                                   |
| Archive move conflicts (name exists)         | Suffix `-2`, `-3`, … and note it                                     |

On any error, print a clear one-line cause plus the failed command; never leave a partial
handover file in place without saying so.
