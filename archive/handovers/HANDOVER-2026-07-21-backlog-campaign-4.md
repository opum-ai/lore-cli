# Handover — third backlog campaign, cursor at LCLI-83 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 8a11f2f`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-83 — profile.toml field/type declarations silently ignore
unknown or misspelled attribute keys. Queue order confirmed by user on
2026-07-21 (independent fixes first, the LCLI-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 16-issue queue remaining,
all from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for
full context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-83, Queue = 16 items, LCLI-87 moved to Resolved, one new convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 16 tasks remaining (LCLI-83, 84, 82, 85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-87` fully merged (PR #67, rebase-merged, commit `9ef143f`) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 — unchanged, deferred by recorded product decision |

## Next steps

1. Run the per-issue lifecycle on **LCLI-83** (`profile.toml field/type
   declarations silently ignore unknown or misspelled attribute keys`):
   branch `feature/LCLI-83` off `dev`, read the task's AC, implement, verify,
   review, PR, self-merge, prune. Root area: `src/core/profile.ts` —
   `parseFieldSpec` (line ~435), `parseTypes` (line ~347), and `parseItems`
   (line ~473) each read known attribute keys by name with no unknown-key
   check, so a typo like `require = true` (meant `required`) silently
   defaults to `false` instead of erroring. The task's own description notes
   the documented forward-compatible unknown-key tolerance is explicitly
   scoped to ONLY the top-level `[profile]` table, not nested field/type/item
   tables — re-verify that scoping claim against current source/docs before
   implementing (this campaign's standing discipline: task descriptions are
   Codex-review-sourced, not infallible).
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-84** (item #2 of the remaining queue).
3. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-84. Note: today's date (`2026-07-21`) already has THREE prior
   archived handovers (base, `-2`, `-3`) — this session's own archival will
   need suffix `-4`.

## Critical context / traps

- **Three queued issues are one gap at three layers** (see doc-1's Campaign
  conventions): LCLI-78 (arg-parsing), LCLI-79 (rename command), LCLI-80
  (shared `rewriteInbound` engine) all describe `lore rename`'s destination
  path never being confined to `docs/`. They're queued last (now #14-16 of
  the remaining queue) intentionally — LCLI-80 last of the three so its
  containment fix is available before/while working the other two. Read all
  three task descriptions before starting any one.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 11 prior sessions ran clean despite it. `.repro-scratch/`
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
  prior campaign task). This has genuinely mattered in past sessions (e.g.
  LCLI-61/68's filing hypotheses both turned out wrong on closer inspection).
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. Every
  review so far this campaign has either found a real, fixable issue or done
  genuinely independent verification work (re-deriving end-to-end repros
  from scratch rather than trusting the implementer's claims) — keep using
  it as a real second pass, not a formality. This session's review was
  clean (no findings) but only after probing edge cases and the sibling
  function independently, not by rubber-stamping.
- **New convention from this session (LCLI-87)**: in `src/core/rewrite.ts`,
  a raw-source structural scan can only reuse a parsed mdast node's own
  `children` offsets when that node TYPE actually has children — a
  `definition` node doesn't (only decoded `identifier`/`label`/`url`/`title`
  strings), so it needed its own escape-aware scan mirroring
  `scanDestination`'s existing `\`-escape convention. Verify with a real
  `fromMarkdown` parse which node types carry `children` before assuming a
  structural shortcut is available, rather than guessing from the type name.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again — the user denied
  that action once already, earlier in this campaign.
- Don't build a real-subprocess flush/truncation regression test around
  `Bun.spawnSync`'s own direct `stdout: "pipe"` capture — it produces a false
  negative (passes even against broken code) for that class of bug; see
  `test/cli-exit-flush.test.ts` (LCLI-70) for the correct pattern
  (`sh -c "cmd | cat"`).
- Don't assume every merged bugfix needs a CHANGELOG.md entry just because
  older fixes (LCLI-58/59/60) had one — check actual recent precedent first.
  Neither LCLI-68, LCLI-70, nor LCLI-86/87 (all merged in this same campaign
  lineage) added one; the tracker doc, not CHANGELOG.md, is this campaign's
  record of truth.
