# Handover — third backlog campaign, cursor at LCLI-86 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ e4243d8`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 1 unpushed commit (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-86 — lore sync can silently delete hand-authored prose between
duplicate/malformed managed-block markers. Queue order confirmed by user on
2026-07-21 (independent fixes first, the LCLI-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 18-issue queue remaining,
all from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for
full context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-86, Queue = 18 items, LCLI-70 moved to Resolved, one new convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 18 tasks remaining (LCLI-86, 87, 83, 84, 82, 85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (1 commit still to push this session — the handover-archive commit) |
| Leftover branches/PRs | none — `feature/LCLI-70` fully merged (PR #65, rebase-merged, commit `099270c`) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 — unchanged, deferred by recorded product decision |

## Next steps

1. Run the per-issue lifecycle on **LCLI-86** (`lore sync can silently delete
   hand-authored prose between duplicate/malformed managed-block markers`):
   branch `feature/LCLI-86` off `dev`, read the task's AC, implement, verify,
   review, PR, self-merge, prune. Root area: `locateManagedBlock` (managed
   block detection — likely `src/core/managed-block.ts` or similar; re-verify
   the exact file against current HEAD before editing, per this campaign's
   standing discipline).
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-87** (item #2 of the remaining queue).
3. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-87.

## Critical context / traps

- **Three queued issues are one gap at three layers** (see doc-1's Campaign
  conventions, last-but-one bullet): LCLI-78 (arg-parsing), LCLI-79 (rename
  command), LCLI-80 (shared `rewriteInbound` engine) all describe `lore
  rename`'s destination path never being confined to `docs/`. They're queued
  in that order intentionally — LCLI-80 last of the three (now #15 in the
  remaining queue) so its containment fix is available before/while working
  the other two. Read all three task descriptions before starting any one;
  fixing LCLI-80 may reshape what LCLI-79/78 actually need.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 9 prior sessions ran clean despite it. `.repro-scratch/`
  is disposable scratch from an earlier session's Codex-review verification
  work — the user explicitly declined to have it auto-deleted, so leave it
  as-is. Neither should trip the lifecycle's step-0 clean-tree preflight in
  spirit, but the literal `git status --porcelain` check WILL show them — if
  the skill's preflight treats that as a hard stop, surface it and ask rather
  than deleting anything.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this
  specific campaign (recorded in doc-1's Cursor section), matching the
  `backlog-handover` skill's own stated default. This is a deliberate,
  explicit exception to this repo's general "don't self-merge, user reviews
  PRs" convention — the exception applies ONLY inside this campaign's
  one-issue-per-session lifecycle, not to ad-hoc feature work outside it.
- **LCLI-69..87 come from `doc-2`, not a filing task's own prose** — each
  task description is self-contained with a verified repro, but re-verify
  against current HEAD before implementing anyway (same discipline as every
  prior campaign task — see doc-1's Campaign-conventions section for why this
  matters).
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. This
  session's `general-purpose` review of LCLI-70 found one real, moderate
  issue (a missing Windows platform guard on a new subprocess-spawning test)
  that a self-review had missed — worth continuing to use it, not skipping
  step 6 as a formality.
- **New convention from this session**: a real-subprocess test that wants to
  reproduce a `process.exit()`-vs-async-write race on a piped destination
  must route through an actual downstream process (`sh -c "cmd | cat"`), not
  `Bun.spawnSync(..., {stdout: "pipe"})`'s own direct capture — the latter
  reads too eagerly to trigger the race (verified empirically: the
  direct-capture harness stayed green even against deliberately broken code).
  If any future queued task needs to reproduce process-exit/stdio timing
  bugs, this pattern is in `test/cli-exit-flush.test.ts`.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, earlier in this campaign.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — it produces a false
  negative (passes even against broken code) for this exact class of bug; see
  the new convention above.
