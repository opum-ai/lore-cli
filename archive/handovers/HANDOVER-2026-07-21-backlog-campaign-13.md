# Handover — third backlog campaign, cursor at LORE-73 (LORE-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ d50910e`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LORE-73 — lore replace can corrupt lore:tasks managed blocks
(MANAGED_MARKERS gap). NOT security-labeled (labels: codex-review,
correctness) — a data-corruption correctness bug, first non-security task
since LORE-72. Queue order confirmed by user on 2026-07-21 (independent fixes
first, the LORE-78/79/80 rename-traversal cluster last); do not re-ask. Merge
gate is self-merge (skill default, user-confirmed 2026-07-19) — no
PR-approval wait. 7-issue queue remaining, all from a full-codebase Codex
review (see backlog/docs/reviews/doc-2 for full context/repro detail on
every issue, and doc-1's Cursor/Queue/Campaign-conventions sections for the
rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LORE-73, Queue = 7 items, LORE-77 moved to Resolved with its clean review documented, two new campaign conventions recorded, one new Not-queued follow-up) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 7 tasks remaining (LORE-73, 74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LORE-77` fully merged (PR #76, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune`) |
| Not queued | LORE-42/43/44/45 (deferred) plus seven unfiled follow-up candidates: two from LORE-84, one from LORE-69, two from LORE-72, one from LORE-76 (TOCTOU), one from LORE-77 (`new.ts`/`agents.ts`/`sync.ts`/`schema.ts`/`rename.ts` still unguarded by the symlink check LORE-76/77 added) |

## Next steps

1. Run the per-issue lifecycle on **LORE-73** (`lore replace` can corrupt
   `lore:tasks` managed blocks, correctness — NOT security-labeled, but the
   same lifecycle applies): branch `feature/LORE-73` off `dev`, read the
   task's AC, implement, verify, review, PR, self-merge, prune. Grounded code
   pointers (verified this session, not just the filing task's own prose):
   - `src/core/replace.ts:88-90` — `MANAGED_MARKERS` currently has exactly
     ONE entry: `{ begin: INDEX_BLOCK_BEGIN, end: INDEX_BLOCK_END }`
     (imported from `./indexes`). The `lore:tasks` marker pair (added by
     LORE-22's `managed-block.ts`, which shipped AFTER `replace.ts`) was
     never added to this registry — confirmed by reading the file directly,
     matching the task's exact claim.
   - `src/core/managed-block.ts:77-78` — `export const TASK_BLOCK_BEGIN =
     "<!-- lore:tasks:begin -->"` / `export const TASK_BLOCK_END = "<!--
     lore:tasks:end -->"` — the exact constants to import and add as a
     second `MANAGED_MARKERS` entry.
   - `src/core/replace.ts:106-115`'s `managedRanges` already calls the
     SHARED, marker-pair-AGNOSTIC `locateManagedBlock` (from `./indexes`,
     LORE-86-hardened to fail loud on a malformed marker pair) generically
     for every entry in `MANAGED_MARKERS` — the function takes `begin`/`end`
     as plain string parameters, nothing index-specific, so adding the
     `lore:tasks` entry to the array is very likely THE ENTIRE FIX (a
     one-line-ish change) rather than needing new location logic. The
     module's own doc comment at line 34 already says as much ("The marker
     registry makes `<!-- lore:tasks -->` a one-entry addition") — this is
     DESIGN INTENT stated in advance, not a claim it's already done; verify
     this by actually reading the current array (confirmed empty of it this
     session) rather than trusting the comment's framing.
   - Still verify empirically once implemented: does `locateManagedBlock`
     (built for the plain lore:index block) actually handle a `lore:tasks`
     block correctly given `managed-block.ts` has its OWN, separate,
     mdast-based marker-finding logic (`findMarkers`/`locateLabeledMarkers`,
     per prior campaign sessions) — are these two implementations
     compatible/interchangeable for simple begin/end byte-span location, or
     does `lore:tasks`'s block have some structural difference (e.g.
     multiple distinct labeled sub-blocks?) that the plain `locateManagedBlock`
     can't correctly bound? Read `managed-block.ts` in full before assuming
     a drop-in works — don't just trust the module docstring's optimism.
2. **AC3** needs a regression test with a real `lore:tasks` block containing
   a live task row, asserting a `lore replace` match INSIDE it is skipped
   (uncounted, text unchanged) — mirroring whatever existing test pattern
   covers the `lore:index` case in `test/replace.test.ts`.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature
   branch before merging (per the skill's step 4), advancing the cursor to
   the NEXT item in the queue (LORE-74 per the last-read order, but
   re-confirm against the tracker's own Queue table at restore time).
4. Archive this handover to `archive/handovers/` and write the next one.
   Note: today's date (`2026-07-21`) already has TWELVE prior archived
   handovers (base, `-2` through `-12`) — this session's own archival will
   need suffix `-13`.

## Critical context / traps

- **LORE-73 is NOT security-labeled** (`codex-review, correctness`) — the
  first non-security task since LORE-72. Still run the full lifecycle
  (branch, implement, verify, independent review, PR, merge) but the
  review's framing can be a normal correctness review rather than an
  explicitly adversarial "try to construct a bypass" one — match the
  reviewer's brief to the task's actual risk profile.
- **The last six tasks in a row (LORE-85, 69, 72, 71, 76, 77) were all
  security-labeled**, and every one of their independent reviews found
  SOMETHING (a live bypass, an out-of-scope gap, a classifier edge case, or
  at minimum confirmed clean on the first pass after genuinely trying hard).
  Don't let LORE-73 being "just correctness" lower the bar on verification
  rigor — a wrong managed-block fix could still silently corrupt user data
  (a live task table), which is its own kind of serious bug even without a
  security label.
- **`.repro-scratch/` keeps accumulating scratch files from every review**
  (LORE-85, 69, 72, 71, 76, 77 all left files there) — all harmless,
  untracked, outside any diff. Per this campaign's standing rule, do NOT
  delete `.repro-scratch/` contents without being asked again.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 20 prior
  sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature
  branch** when it's the currently-checked-out one — `git checkout dev` /
  `git branch -d feature/<KEY>` may report "already on"/"not found" as a
  result; not an error, verify with `git branch -a` + `git fetch --prune`.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across
  all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a module docstring's forward-looking design claim ("the
  registry makes X a one-entry addition") as proof the entry already
  exists — verify the actual array/state directly, which is exactly what
  this handover did (and what LORE-73's own filing task correctly
  identified as still missing).
- Don't assume a "correctness" (non-security) label means lighter
  verification is fine — data corruption in a live-synced managed block is
  still a serious bug; keep the same evidence-based verification discipline
  (live CLI check, `git stash` pre/post-fix proof, independent review) this
  campaign has used throughout.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches to the base branch automatically.
