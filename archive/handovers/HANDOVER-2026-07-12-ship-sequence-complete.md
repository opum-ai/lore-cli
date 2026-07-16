# Handover — Ship sequence complete: all 4 PRs merged, dev promoted to main

**Date**: 2026-07-12 | **Grounded against**: `dev`/`main` both @ `0515ea9` (clean, no open PRs) | **Backlog**: LORE-9, LORE-14, LORE-39, LORE-51 all Done; LORE-40 newly unblocked; LORE-52, LORE-5 still open

## Paste-ready prompt for the next session

```
The prior ship sequence is fully complete: PRs #45 (LORE-39), #46 (LORE-51), #47
(LORE-14), #48 (LORE-9) are all merged, dev has been promoted to main (both at
0515ea9), all four Backlog tasks are marked Done, and all four feature branches
are pruned (local + remote). Nothing is in flight.

FIRST run `backlog instructions overview`.

1. CRITICAL, single biggest remaining unknown in all of LORE-9: release.yml has
   NEVER executed in real GitHub Actions. It's now on both dev and main, so it
   is finally triggerable. Run:
     gh workflow run release.yml --ref dev
   (or the Actions UI, workflow_dispatch, default inputs) and watch it closely
   with `gh run watch <id>`. Every verification so far (5 review rounds across
   this branch's lifetime, actionlint, extensive local reproduction) is real
   but not the same as a real runner executing the real YAML — treat a failure
   as genuinely new information, not "surely another subtle review-missed bug,"
   though given this branch's track record that's not impossible either.
2. LORE-40 (docusaurus scaffold + build smoke test) was blocked on LORE-39
   merging — it has now merged. LORE-40 is unblocked and ready to start
   (branch off dev: `git checkout -b feat/lore-40-... dev`).
3. LORE-5 (upstream Backlog.md --json PR) is still gated on a real npm publish
   step existing, which does not exist yet (LORE-9 deliberately stopped at
   "build mechanics only, before publish" per an earlier explicit scope
   decision — see docs/runbooks/release-publishing.md for what's left: npm
   Trusted Publisher/OIDC setup on npmjs.com for all 6 packages).
4. LORE-52 (reconcile stale remark/unified doc references) is fully
   independent, LOW priority, not started — can slot in anytime.
```

## State

| Item | Status |
| --- | --- |
| PR #45 (LORE-39) | Merged `04070c6` → dev; task Done |
| PR #46 (LORE-51) | Merged `8430d3c` → dev; task Done |
| PR #47 (LORE-14) | Merged `46fcf1c` → dev (conflict-resolved: `docs/log.md`); task Done |
| PR #48 (LORE-9) | Merged `a8e1cb6` → dev (conflict-resolved: `CHANGELOG.md`, `docs/log.md`, `docs/runbooks/index.md`); task Done |
| `dev` → `main` promotion | Fast-forward pushed; both at `0515ea9` |
| Local/remote feature branches | All 4 deleted; stale local refs pruned; 2 orphaned `worktree-wf_*` placeholder branches also deleted |
| `release.yml` first real run | **Not yet triggered** — see next steps #1 |
| LORE-40 | Unblocked (was waiting on LORE-39) |

## Next steps

1. Trigger `release.yml`'s first real GitHub Actions run (see paste-ready prompt above) — the single biggest untested piece of the whole LORE-9 effort.
2. Start LORE-40 (docusaurus scaffold) now that LORE-39 is merged.
3. LORE-52 (doc-drift reconciliation) available anytime, independent.
4. LORE-5 stays blocked until real npm publish wiring exists.

## Critical context / traps

- **`gh pr merge <n> --delete-branch` silently repoints any local checkout (main checkout OR a worktree) that has the deleted branch checked out — to the repo's default branch, with an auto `pull --ff-only`.** This happened twice this session: once to a disposable worktree (harmless, but caused a shell-cwd-drift red herring — a `git merge origin/dev` run from inside that stale worktree reported "already up to date" for reasons that had nothing to do with the actual target branch, purely because the Bash tool's cwd had persisted inside that worktree from an earlier `cd`), and once to the main checkout itself (harmless here too, since the branch had already been squash-merged, but **verify `git branch --show-current` immediately after any `--delete-branch` merge before trusting subsequent git commands' target**).
- **Sequential same-base PR merges will conflict on shared generated/hand-written files.** `docs/log.md` (LORE-47's git-history log) conflicted on nearly every merge — resolution pattern: diff each side against the merge-base; if one side's version is a strict superset of the other's (usually true, since it's append-only per-commit), `git checkout --theirs`/`--ours` wholesale, then run `bun src/cli.ts sync --plain` afterward once the merge commit exists to backfill anything the wholesale choice missed (it found a real gap this session — see PR48's merge, commit `c23ed40`). `CHANGELOG.md` conflicts are NOT safe to resolve this way (hand-written, not generated) — read both sides and keep both entries in a sensible order. `docs/adr/index.md`/`docs/runbooks/index.md` (lore-managed indexes) can have genuinely unique entries on one side (e.g. this session's `release-publishing.md` runbook link existed only on the LORE-9 branch) — check both sides for unique content before discarding either.
- **`workflow_dispatch` requires the workflow file on the default branch to be triggerable** — this constraint is now satisfied (release.yml is on both dev and main).
- **`bun build --compile`'s EXDEV trap** (LORE-14): `--outfile` must be on the same filesystem as the checkout — cross-device silently produces a 0-byte binary at exit `0`.
- **`package.json`'s `bin.lore` is deliberately still `src/cli.ts`, not `bin/lore.cjs`** — flipping it is the first step of cutting a real release (`docs/runbooks/release-publishing.md`), not a standing state.
- **A stale/broken `node_modules/@types/bun` symlink** can cause spurious `tsc` failures unrelated to any real code change — a plain `bun install` fixes it; check for this before assuming a real regression.

## Do not repeat

- **Trusting shell cwd across a sequence of `cd`s inside Bash tool calls without re-verifying** — cwd persists between calls per the tool's own contract, and after using a worktree for conflict resolution, subsequent commands can silently run in the wrong directory if you forget to `cd` back. Always sanity-check `pwd`/`git branch --show-current` after any worktree operation before trusting the next git command's output.
- **A prior handover's claim that a Backlog task was "already filed" turned out to be false** (LORE-52, from the previous session's handover) — the earlier restore session already caught and fixed this by recreating the task; reinforces: verify every ground-truth claim in a restored handover, don't just trust the prose.

## System of record updated

- **LORE-9, LORE-14, LORE-39, LORE-51 Backlog tasks** → all marked Done this session, each with a note naming its merge commit and PR.
- **CHANGELOG.md** → merge-conflict-resolved by hand; both LORE-39's and LORE-9's entries preserved, each with its own post-merge `/code-review max` fold addendum; LORE-51's entry got a correcting addendum (it originally claimed to have *closed* a RangeError risk that the review found it had actually *reintroduced* at a different call site).
- **`docs/log.md`, `docs/runbooks/index.md`** → conflict-resolved, then `lore sync`-regenerated and reconfirmed clean (`lore check`: 37 files, 0 errors, 0 warnings).
- **Branches** → all 4 feature branches deleted (local + remote); 2 orphaned `worktree-wf_*` placeholder branches also cleaned up; stale remote-tracking refs pruned via `git fetch --prune`.
- **Auto-memory** → no new memories needed this session; existing ones (lore-git-workflow, lore-finalize-shorthand, dev-sync-reset-wipes-backlog-edits) all held up as accurate guidance for this session's execution.
