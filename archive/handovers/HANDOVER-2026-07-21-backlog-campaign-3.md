# Handover — third backlog campaign, cursor at LCLI-87 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ c73d1ce`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits (about to be pushed by this same restore session) | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-87 — rewriteInbound mis-locates reference-definition destinations
when the label contains an escaped bracket. Queue order confirmed by user on
2026-07-21 (independent fixes first, the LCLI-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. 17-issue queue remaining,
all from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for
full context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-87, Queue = 17 items, LCLI-86 moved to Resolved, one new convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 17 tasks remaining (LCLI-87, 83, 84, 82, 85, 69, 72, 71, 76, 77, 73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-86` fully merged (PR #66, rebase-merged, commit `82672d4`) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 — unchanged, deferred by recorded product decision |

## Next steps

1. Run the per-issue lifecycle on **LCLI-87** (`rewriteInbound mis-locates
   reference-definition destinations when the label contains an escaped
   bracket`): branch `feature/LCLI-87` off `dev`, read the task's AC,
   implement, verify, review, PR, self-merge, prune. Root area:
   `destRangeForDefinition` at `src/core/rewrite.ts:429` — a plain,
   non-escape-aware `indexOf("]", ...)` search that matches an escaped `\]`
   inside the label instead of the real closing bracket. Re-verify the exact
   line/behavior against current HEAD before editing, per this campaign's
   standing discipline.
2. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   **LCLI-83** (item #2 of the remaining queue).
3. Archive this handover to `archive/handovers/` and write the next one for
   LCLI-83. Note: today's date (`2026-07-21`) already has TWO prior archived
   handovers (`HANDOVER-2026-07-21-backlog-campaign.md` and `-2.md`) — this
   session's own archival will need suffix `-3`.

## Critical context / traps

- **Three queued issues are one gap at three layers** (see doc-1's Campaign
  conventions): LCLI-78 (arg-parsing), LCLI-79 (rename command), LCLI-80
  (shared `rewriteInbound` engine) all describe `lore rename`'s destination
  path never being confined to `docs/`. They're queued in that order
  intentionally — LCLI-80 last of the three (now #14 in the remaining queue)
  so its containment fix is available before/while working the other two.
  Read all three task descriptions before starting any one. Note: LCLI-87
  (this session's cursor) also touches `rewriteInbound`/`rewrite.ts`, but is
  a DIFFERENT bug (escaped-bracket mis-location in reference-definition
  parsing, unrelated to the path-containment gap) — don't conflate the two.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers.** `docs/.obsidian/` has sat untracked since before this
  campaign started — 10 prior sessions ran clean despite it. `.repro-scratch/`
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
  prior campaign task).
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review. Both this
  session's and the prior session's `general-purpose` reviews found real,
  fixable issues (missed a Windows test guard; stale docstrings after a
  behavior change) that self-review had missed — keep using it as a genuine
  second pass, not a formality.
- **New convention from this session**: when a "malformed input recovery"
  bug needs a fail-loud fix, check whether `src/core/managed-block.ts`
  (LCLI-22/36's mdast-based `lore:tasks` engine) already solved the
  identically-shaped problem — it did, for marker validation
  (`findMarkers()`/`locateLabeledMarkers()` throw `LoreError('validation',
  ...)` on a malformed pair instead of guessing). `src/core/indexes.ts`'s
  older plain-string-scan `locateManagedBlock` (shared by index
  regeneration, `lore replace`, `lore rename`) had NOT been brought in line
  with that pattern until LCLI-86 — check other "recover from malformed
  input" code discovered later against this same pattern before inventing a
  new one.
- **A code-review pass can find real staleness beyond the literal diff** —
  this session's review caught two docstrings in `src/core/replace.ts`
  (untouched by the actual code change) that described the OLD behavior as
  current fact after `locateManagedBlock`'s contract changed. Fixed before
  merging. When changing a shared primitive's contract, check every module
  that documents *how it behaves* (not just modules that call it), not only
  the lines the diff touched.

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
  Neither LCLI-68 nor LCLI-70 (both merged in this same campaign lineage)
  added one; the tracker doc, not CHANGELOG.md, is this campaign's record of
  truth. LCLI-86 deliberately skipped a CHANGELOG entry on this basis.
