# Handover — third backlog campaign, cursor at LORE-70 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ c1b298f`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (just pushed) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-70 — process.exit() after run() can truncate large piped --json
output. Queue order confirmed by user on 2026-07-21 (independent fixes first,
the LORE-78/79/80 rename-traversal cluster last); do not re-ask. Merge gate is
self-merge (skill default, user-confirmed 2026-07-19) — no PR-approval wait.
19-issue queue, all from a full-codebase Codex review (see backlog/docs/reviews/
doc-2 for full context/repro detail on every issue, and doc-1's Cursor/Queue/
Campaign-conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-70, Queue = 19 items, new convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all 19 queued tasks |
| Queue | 19 tasks, LORE-69..87, all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (pushed) |
| Leftover branches/PRs | none |
| Not queued | LORE-42/43/44/45 — unchanged, deferred by recorded product decision |

## Next steps

1. Run the per-issue lifecycle on **LORE-70** (`process.exit() after run() can truncate large piped --json output`, `src/cli.ts:373`): branch `feature/LORE-70` off `dev`, read the task's AC, implement, verify (the task's own description has a live repro: `bun -e 'process.stdout.write("x".repeat(200000)); process.exit(0)' | wc -c` → confirms truncation at exactly 65536 bytes today), review, PR, self-merge, prune.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4), advancing the cursor to **LORE-86** (item #2).
3. Archive this handover to `archive/handovers/` and write the next one for LORE-86.

## Critical context / traps

- **Three queued issues are one gap at three layers** (see doc-1's Campaign
  conventions, last bullet): LORE-78 (arg-parsing), LORE-79 (rename command),
  LORE-80 (shared `rewriteInbound` engine) all describe `lore rename`'s
  destination path never being confined to `docs/`. They're queued in that
  order intentionally — LORE-80 last of the three (#16 in the queue) so its
  containment fix is available before/while working the other two. Read all
  three task descriptions before starting any one; fixing LORE-80 may reshape
  what LORE-79/78 actually need.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers.**
  `docs/.obsidian/` has sat untracked since before this campaign started (see
  doc-1's Campaign-conventions bullet on it) — 8 prior sessions ran clean
  despite it. `.repro-scratch/` is disposable scratch from this session's
  Codex-review verification work — the user explicitly declined to have it
  auto-deleted (denied an `rm -rf` tool call), so leave it as-is; do not
  re-attempt deleting it without being asked. Neither should trip the
  lifecycle's step-0 clean-tree preflight in spirit, but the literal
  `git status --porcelain` check WILL show them — if the skill's preflight
  treats that as a hard stop, surface it and ask rather than deleting anything.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this
  specific campaign (recorded in doc-1's Cursor section), matching the
  `backlog-handover` skill's own stated default. This is a deliberate,
  explicit exception to this repo's general "don't self-merge, user reviews
  PRs" convention (see auto-memory `lore-git-workflow`) — the exception
  applies ONLY inside this campaign's one-issue-per-session lifecycle, not to
  ad-hoc feature work outside it.
- **LORE-69..87 come from `doc-2`, not a filing task's own prose** — each
  task description is self-contained with a verified repro, but re-verify
  against current HEAD before implementing anyway (same discipline as every
  prior campaign task — see doc-1's Campaign-conventions section for why this
  matters, e.g. LORE-61/68's filing hypotheses both turned out wrong on
  closer inspection).
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again this session — the
  user denied that action once already today.
