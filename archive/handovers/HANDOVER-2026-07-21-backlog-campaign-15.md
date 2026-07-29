# Handover — third backlog campaign, cursor at LCLI-75 (LCLI-69..87)

**Date**: 2026-07-21 | **Grounded against**: `dev @ 2a7cd5d`, clean except `.repro-scratch/` and `docs/.obsidian/` (both pre-existing/unrelated, leave alone), 0 unpushed commits, 0 ahead/behind `origin/dev` | **Tracker**: doc-1

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1.
Cursor: LCLI-75 — lore schema export --out can irreversibly delete unrelated
files outside its own directory (pruneOrphans deletes any *.schema.json in
the resolved --out dir with no check the directory is lore-owned). Labels:
codex-review, correctness — NOT security-labeled but genuinely destructive
(irreversible rmSync with no confirmation). Queue order confirmed by user on
2026-07-21 (independent fixes first, the LCLI-78/79/80 rename-traversal
cluster last); do not re-ask. Merge gate is self-merge (skill default,
user-confirmed 2026-07-19) — no PR-approval wait. Run the lifecycle's step 6
independent review (general-purpose subagent) before merging — do NOT
pre-write "no review" into the tracker before it actually runs (LCLI-74's
own session did this and had to correct it). 5-issue queue remaining after
LCLI-75 (LCLI-80, 79, 78, 81), all from a full-codebase Codex review (see
backlog/docs/reviews/doc-2 for full context/repro detail on every issue, and
doc-1's Cursor/Queue/Campaign-conventions sections for the rest).
```

## State

| Item | Status |
| --- | --- |
| Tracker doc | doc-1, updated this session (Cursor → LCLI-75, Queue = 5 items, LCLI-74 moved to Resolved with its review evidence, one new campaign convention recorded) |
| Review doc | doc-2, full Codex second-opinion review (201 confirmed findings, 25/25 clusters) — source of all queued tasks |
| Queue | 5 tasks remaining (LCLI-75, 80, 79, 78, 81), all `To Do`, `bug`, `High` priority, each with AC + a `--ref` to doc-2 |
| Branch | `dev`, clean (0 unpushed after this session's final push) |
| Leftover branches/PRs | none — `feature/LCLI-74` fully merged (PR #78, rebase-merged) and pruned (local + remote, confirmed via `git fetch --prune` + `git branch -a`) |
| Not queued | LCLI-42/43/44/45 (deferred) plus the same seven unfiled follow-up candidates as before (LCLI-74 added no new one) |

## Next steps

1. Run the per-issue lifecycle on **LCLI-75** (`lore schema export --out` can irreversibly delete unrelated files outside its own directory): branch `feature/LCLI-75` off `dev`, read the task's AC, implement, verify, review, PR, self-merge, prune. Grounded code pointers (verified this session, not just the filing task's own prose) — all in `src/commands/schema.ts`:
   - `pruneOrphans` (line ~146): on a **full** export (no `--type`), deletes every `<name>.schema.json` in the resolved `--out` directory that the just-written file set doesn't contain — by filename suffix only, with **zero check that the directory is lore-owned**. `rmSync` at line ~159 is unconditional and irreversible.
   - `confineOutDir` (line ~130) already confines `--out` to inside the repo (rejects `..`/absolute) — that guard is about **where** the directory can be, not **whether lore owns what's already in it**. `--out .` (the repo root itself) is explicitly allowed by that function's own doc comment — meaning a full export to the repo root would `readdirSync` the ENTIRE root and prune any `*.schema.json` sitting there, unrelated or not.
   - `SCHEMAS_DIR = ".lore/schemas"` (`src/core/schema.ts:285`) is the default `--out`; a non-default `--out` is explicitly documented (schema.ts's own module docstring, line ~20) as "for ad-hoc/CI use."
   - **Design question to resolve before implementing** (not yet decided this session, per AC#1's own phrasing: "requires a marker file, or restricts pruning to the default `.lore/schemas/` path unless explicitly opted in" — AC#1 offers two illustrative shapes, not a mandate for one): (a) only prune when `absOutDir === resolve(root, SCHEMAS_DIR)` (simplest, matches "restricts pruning to the default path"); or (b) write/check a lore-owned marker file (e.g. `.lore-schemas-marker` or similar) in any `--out` directory the first time lore exports there, and only prune directories carrying that marker (matches AC#1's other illustrative option, and would let a non-default `--out` still get pruning after an explicit first opt-in). Re-read AC#2's wording too ("does not delete them, or requires an explicit opt-in flag with a warning") — a third valid shape is a new `--prune`/`--force` flag gating the whole prune step for non-default `--out`. Pick ONE and justify it against both ACs' exact wording, not just AC#1's illustrative parenthetical.
   - Whatever shape is chosen, `--out .` (repo root, explicitly allowed by `confineOutDir`) is the sharpest concrete repro to verify against — it's the case where "unrelated pre-existing `*.schema.json` file" is most likely to exist for real (any repo-root `*.schema.json` a user or another tool placed there).
2. **AC3** — add a test exporting into a directory with an unrelated `*.schema.json` file and assert it survives. Existing `test/schema.test.ts` likely already has prune-related coverage for the **legitimate** case (a profile type removed → its schema pruned); confirm via `git stash` that the new test genuinely fails against today's code (the unrelated file gets deleted) and passes post-fix, matching this campaign's standing discipline (see Do-not-repeat below).
3. Update doc-1's Cursor/Queue/Resolved/Session-log sections on the feature branch before merging (per the skill's step 4), advancing the cursor to **LCLI-80** (`rewriteInbound` shared engine does not confine `fromId`/`toId` to `docs/` bundle root) — the next queue item, and the first of the LCLI-80→79→78 rename-traversal cluster; re-confirm against the tracker's own Queue table at restore time in case of drift.
4. Run the lifecycle's step 6 independent review (`general-purpose` subagent) **before** writing "review outcome" into the tracker — this session initially pre-wrote "no independent review round" into doc-1 before actually running one, had to correct it after the review came back (clean, no issues) with a follow-up doc-1 edit + commit. Don't repeat that ordering mistake: run the review, THEN write what happened.
5. Archive this handover to `archive/handovers/` and write the next one. Note: today's date (`2026-07-21`) already has FOURTEEN prior archived handovers (base, `-2` through `-14`) — this session's own archival will need suffix `-15`.

## Critical context / traps

- **LCLI-75 is NOT security-labeled** (`codex-review, correctness`) but is genuinely destructive — an unconditional, irreversible `rmSync` with no confirmation, on a directory the user may not have intended lore to own. Run the full lifecycle with full rigor (this campaign's own established standard: don't treat "non-security" as "lighter verification," see LCLI-74's own Do-not-repeat entry below, itself inherited from LCLI-73).
- **This session (LCLI-74) pre-wrote a tracker claim about skipping review before actually deciding/running one** — caught before merge (the lifecycle's own step 6 forces the review to actually happen), but the tracker/session-log briefly said something untrue until corrected with a follow-up commit. The fix going forward: do the review, THEN write about it — never the reverse, even when the fix looks routine enough that a review "probably" won't find anything.
- `.repro-scratch/` keeps accumulating scratch files from every review (unchanged this session — LCLI-74 added none, no live-CLI repro artifacts were needed beyond the smoke test) — still don't delete its contents without being asked again.
- `docs/.obsidian/` and `.repro-scratch/` are known, intentional non-blockers for the lifecycle's step-0 clean-tree preflight — 22 prior sessions ran clean despite them.
- **Merge gate is self-merge** — confirmed by the user on 2026-07-19 for this specific campaign.
- No `code-reviewer` subagent type is registered in this project — use `general-purpose` for the lifecycle's step-6 independent review.
- **`gh pr merge --rebase --delete-branch` auto-switches you off the feature branch** when it's the currently-checked-out one — `git checkout dev` / `git branch -d feature/<KEY>` may report "already on"/"not found" as a result; not an error, verify with `git branch -a` + `git fetch --prune`. This session it worked cleanly on the first try (no local-checkout race this time, unlike LCLI-73).
- **A bounded-output command with more than one independent result section needs a total/shown/truncated triple PER SECTION** (new this session, see doc-1's Campaign-conventions section) — not immediately relevant to LCLI-75, but relevant if any future queued task touches another multi-section report.

## Do not repeat

- Don't recreate the tracker doc — doc-1 already exists and is reused across all three campaigns to date; `backlog doc list --plain` finds it.
- Don't delete `.repro-scratch/` without being asked again.
- Don't trust a synthetic test suite alone as proof a bundle-wide command fix is correct — run the real CLI against this repo's own `docs/` tree too (LCLI-73's round-1→round-2 lesson, the costliest miss this campaign; LCLI-75 isn't bundle-wide in the same sense, but the "run the real CLI, don't just trust synthetic fixtures" discipline still applies — try the real `--out .` case against a scratch repo, not just a synthetic test).
- Don't assert "lint clean"/"tests are green" — or "no review needed"/"review found nothing" — in task/tracker notes from memory or before actually running the check. Run the command (or the review) first, then write the claim (LCLI-73's original lesson; LCLI-74 re-learned the review-ordering half of it the hard way this session).
- Don't assume a "non-security" (correctness) label means lighter verification is fine — `pruneOrphans`'s unconditional `rmSync` is a real destructive-operation hazard even without a security label; keep the same evidence-based verification discipline (live CLI check against the sharpest repro — `--out .` — `git stash` pre/post-fix proof, independent review) this campaign has used throughout.
- Don't assume `gh pr merge --delete-branch` leaves you on the feature branch — it switches to the base branch automatically.
