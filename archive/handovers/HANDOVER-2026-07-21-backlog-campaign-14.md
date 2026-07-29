# Handover — third backlog campaign, cursor at LCLI-74 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ fb2db2f`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-74 — lore orphans report has no output cap, contradicting the
documented bounded-output-with-truncation contract (cli-contract.md §3).
NOT security-labeled (labels: codex-review, api-design) — an API-contract
consistency bug, second non-security task in a row after LCLI-73. Queue
order confirmed by user on 2026-07-21 (independent fixes first, the
LCLI-78/79/80 rename-traversal cluster last); do not re-ask. Merge gate is
self-merge (skill default, user-confirmed 2026-07-19) — no PR-approval
wait. 6-issue queue remaining after LCLI-74 (LCLI-75, 80, 79, 78, 81), all
from a full-codebase Codex review (see backlog/docs/reviews/doc-2 for full
context/repro detail on every issue, and doc-1's Cursor/Queue/Campaign-
conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-74, Queue = 6 items, LCLI-73 moved to Resolved with its 3-round-fix/2-round-review evidence, four new campaign conventions recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 6 tasks remaining (LCLI-74, 75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-73` fully merged (PR #77, rebase-merged, plus one metadata-only commit reconciled by direct cherry-pick onto `dev` after a `gh pr merge` local-checkout race — see Critical context) and pruned (local + remote) |
| Not queued | LCLI-42/43/44/45 (deferred) plus the same seven unfiled follow-up candidates as before (LCLI-73 added no new one) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-74** (`lore orphans` report has no
   output cap, contradicting the documented truncation contract): branch
   `feature/LCLI-74` off `dev`, read the task's AC, implement, verify,
   review, PR, self-merge, prune. Grounded code pointers (verified this
   session, not just the filing task's own prose):
   - `src/commands/orphans.ts` — `computeOrphans` (line ~152) builds
     `orphanTasks`/`danglingLinks` as full, uncapped arrays; `runOrphans`
     (line ~121) emits the whole `OrphansReport` with no limit anywhere.
     `renderReport` (line ~262) renders every row of both sections via a
     per-item loop (the LCLI-51 fix already made this loop-based rather
     than spread-based, to dodge a `RangeError` on a huge array — but
     "doesn't crash on 700k rows" and "doesn't dump 700k rows" are
     different properties; only the first is currently true).
   - `src/output.ts` has the exact precedented bounded-output primitives
     already used by `query`/`graph`/`context`: `Truncation` (interface,
     line ~174: `{ total, shown, truncated, hint? }`), `truncation(total,
     shown, hint?)` (builder, line ~199, derives `truncated` — never trust
     a hand-built one), `renderTruncationLine(t)` (line ~235, the
     `showing N of M — <hint>` footer line, returns `""` when nothing was
     truncated so a caller can unconditionally append it).
   - `src/commands/query.ts` is the cleanest existing consumer to mirror:
     a `--limit` flag (parsed at line ~143 via `parseCount`, rejects
     non-integer/non-positive), a `DEFAULT_QUERY_LIMIT = 20` constant
     (`src/core/query.ts:186`, `options.limit ?? DEFAULT_QUERY_LIMIT`),
     and `renderTruncationLine(truncation(data.total, data.shown,
     NARROW_HINT))` appended as the footer (query.ts line ~274).
   - **Design question to resolve before implementing** (not yet decided
     this session): `orphans` has TWO independent sections
     (`orphanTasks`, `danglingLinks`), unlike `query`'s single flat list.
     Decide whether each section gets its own independent
     limit/total/shown/truncated (two `Truncation`s, one per section —
     probably right, since the two counts are conceptually unrelated) or
     a single combined cap across both. Re-read `docs/reference/cli-
     contract.md`'s actual §3 wording for `orphans` specifically (grep
     for "orphans" in that file) before deciding — the task description
     says it's "named... alongside query/graph/context" as subject to the
     contract, but verify the exact wording rather than assuming it
     matches query's shape 1:1.
   - Check whether `--limit` needs its own new CLI flag on `orphans` (it
     currently only takes `--tasks-only`/`--docs-only`, parsed in
     `parseOrphansArgs`, line ~207) or whether a fixed default cap with no
     user-facing override is sufficient — re-read the task's AC wording
     ("caps emitted rows and reports total/shown/truncated counts,
     consistent with query/graph/context") and check whether `graph`/
     `context` expose their own `--limit` flags too (grep both) before
     deciding whether omitting one on `orphans` would be an inconsistency
     the review will flag.
2. **AC2** — `test/orphans.test.ts:301-329`'s existing LCLI-51 regression
   test currently asserts the OPPOSITE of the new contract: it builds
   700,000 orphan tasks and asserts the header reads `700000 orphan
   tasks` AND that both the lowest (`LCLI-0`) and highest (`LCLI-699999`)
   id are rendered — i.e. it pins today's unbounded dump as correct
   behavior. This test needs updating, not just leaving alone: preserve
   its actual point (a huge input must not crash — the original LCLI-51
   `RangeError` regression) while updating its assertions to match the
   new capped/truncated contract (total=700000, shown=<the new cap>,
   truncated=true, and the truncation footer line present). Confirm via
   `git stash` that the updated test genuinely fails against today's
   uncapped code and passes post-fix, same discipline as every prior
   task this campaign.
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the
   feature branch before merging (per the skill's step 4), advancing the
   cursor to **LCLI-75** (`lore schema export --out` can irreversibly
   delete unrelated files outside its own directory) — the next queue
   item; re-confirm against the tracker's own Queue table at restore time
   in case of drift.
4. Archive this handover to `archive/handovers/` and write the next one.
   Note: today's date (`2026-07-21`) already has THIRTEEN prior archived
   handovers (base, `-2` through `-13`) — this session's own archival
   will need suffix `-14`.

## Critical context / traps

- **LCLI-74 is NOT security-labeled** (`codex-review, api-design`) — an
  API-contract consistency bug (documented behavior vs. actual behavior),
  not a vulnerability. Still run the full lifecycle (branch, implement,
  verify, independent review, PR, merge) with full rigor — an unbounded
  report is a real operational hazard (can exhaust CI logs or blow an
  agent context window on a large Backlog snapshot), just not a security
  one; match the reviewer's brief to a normal correctness/consistency
  review, not an adversarial "try to construct a bypass" one.
- **LCLI-73 (this session, previous cursor) needed THREE fix rounds and
  TWO independent review rounds** — the most review-intensive task this
  campaign. Round 1 (reusing `indexes.ts`'s literal `indexOf`-based
  `locateManagedBlock` for the new `lore:tasks` marker pair) passed a
  full green test suite AND a live scratch-bundle repro, but broke `lore
  replace`'s default invocation against THIS repo's own real `docs/`
  bundle (several ADRs/runbooks cite the `lore:tasks:begin`/`:end` syntax
  in prose/fenced examples — the literal scan can't tell a citation from
  a real block). **The single biggest lesson: a synthetic-fixture-only
  test suite can be 100% green while a fix is still broken against the
  actual repo's real content** — for any fix touching a bundle-wide
  command (`replace`, `check`, `sync` with no scope), run the real CLI
  against `dev`'s actual `docs/` tree (dry-run is safe) as a verification
  step, not just the task's own narrow repro or synthetic tests. This is
  now a standing convention (see doc-1's Campaign-conventions section,
  the four new 2026-07-21/LCLI-73 entries) — apply it to LCLI-74 too if
  the fix touches how `orphans` walks/reports over bundle-wide data,
  though the risk profile here is different (a cap, not a matcher).
- Also newly recorded from LCLI-73: don't assert "lint is clean"/"tests
  are green" in task notes from memory — capture the actual exit code
  immediately before writing the claim. A follow-up review caught a real
  CI-blocking lint error the round-2 notes had incorrectly claimed was
  clean.
- Also newly recorded from LCLI-73: a `gh pr merge --rebase` can succeed
  on GitHub's side while its own local git-checkout cleanup step still
  errors (e.g. an uncommitted local file blocking the post-merge branch
  switch). If this happens: check `gh pr view <n> --json state,mergedAt`
  before retrying — a retry after a successful merge just reports
  "already merged" and is harmless, but if you pushed a NEW commit to the
  feature branch between the first (silently-successful) call and
  noticing the local error, that commit will NOT be on the base branch.
  Diff `git log <base>..origin/feature/<KEY>` to find what's missing,
  then cherry-pick it onto the base directly (safe for a metadata-only
  commit) rather than assuming a second `gh pr merge` will pick it up —
  it won't, the PR is already closed. This exact sequence happened this
  session (a task-notes-update commit ended up needing a direct
  cherry-pick onto `dev`, `0e30f2b`).
- **`.repro-scratch/` keeps accumulating scratch files from every
  review** (now also from LCLI-73's two review rounds, including a
  scratch `lore init`+`lore new story` bundle at
  `.repro-scratch/lore73-e2e/`) — all harmless, untracked, outside any
  diff. Per this campaign's standing rule, do NOT delete
  `.repro-scratch/` contents without being asked again.
- **`docs/.obsidian/` and `.repro-scratch/` are known, intentional
  non-blockers** for the lifecycle's step-0 clean-tree preflight — 21
  prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for
  this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use
  `general-purpose` for the lifecycle's step-6 independent review.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the
  feature branch** when it's the currently-checked-out one — `git
  checkout dev` / `git branch -d feature/<KEY>` may report "already
  on"/"not found" as a result; not an error, verify with `git branch -a`
  + `git fetch --prune`. Also (new this session): if `gh pr merge`
  itself reports a LOCAL error (not a GitHub-side failure), check
  `gh pr view <n> --json state,mergedAt` before assuming the merge didn't
  happen — see the bullet above.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused
  across all three campaigns to date; `backlog doc list --plain` finds
  it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a bundle-wide command
  fix is correct — run the real CLI against this repo's own `docs/` tree
  too (LCLI-73's round-1→round-2 lesson, the costliest miss this
  campaign).
- Don't assert "lint clean"/"tests green" in task notes without the
  actual command's exit code in hand (LCLI-73 round 2's own notes got
  this wrong).
- Don't assume a "non-security" (api-design/correctness) label means
  lighter verification is fine — an unbounded report is a real
  operational hazard even without a security label; keep the same
  evidence-based verification discipline (live CLI check, `git stash`
  pre/post-fix proof, independent review) this campaign has used
  throughout.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature
  branch — it switches to the base branch automatically. And don't
  assume a `gh pr merge` local error means the merge didn't happen on
  GitHub's side — check before retrying or manually re-merging.
