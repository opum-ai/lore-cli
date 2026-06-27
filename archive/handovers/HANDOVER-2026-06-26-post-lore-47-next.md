# Handover — LORE-47 fully landed; pick the next task (no work in flight)

**Date**: 2026-06-26 | **Grounded against**: `dev`=`ad8c5fe` (==origin/dev, clean tree, on `dev`, no open PRs) | **Backlog**: LORE-47 **Done**

## Paste-ready prompt for the next session

```
LORE-47 (GitAdapter seam + git-history log.md + resource stamping) is FULLY LANDED: squash-merged
via PR #18 (feat 8249d9e), post-merge chore 3f5423a, CHANGELOG refinement ad8c5fe. dev = ad8c5fe
== origin/dev, clean tree, you are ON dev, NO open PRs, nothing uncommitted. All 13 /code-review
max findings were fixed on-branch before merge (recorded in LORE-47 notes) — NONE were deferred.

There is NO work in flight. The only open thing is choosing the next task. Per CLAUDE.md, FIRST run
`backlog instructions overview`, then `backlog task list --plain`.

Locked facts to trust (don't re-derive):
- The real git-shelling GitAdapter + `lore sync` wiring that materializes log.md is ALREADY a task:
  LORE-26 "lore sync" (HIGH, To Do). Do NOT create a new "sync follow-up" — the log.ts review
  findings were fixed in #18, not deferred, so LORE-26 is just the command-layer adapter now.
- The prior handover flagged LORE-20 "lore schema export" (MEDIUM) as the next candidate, but the
  HIGH set is unstarted: two tracks — the Backlog-fork --json track (LORE-1/2/3/4/5 → 21) and the
  core-commands track (LORE-26 sync / LORE-27 check / LORE-28 links / LORE-22 managed-block /
  LORE-23 reconcile / LORE-24 link / LORE-29 index+log gen / LORE-30 link lint). Ask Jeremy which
  track/task; don't assume.

Per-task workflow: new feature branch off dev → implement → gates (bun test + `bunx biome check
src/ test/` + `bunx tsc --noEmit` + `bun test --coverage`) → `/code-review max` → PR into dev.
Jeremy reviews+merges himself. He said "admin-merge" for #18 ONLY — that authorization does NOT
carry forward; do not self-merge again unless he says so per-PR.
```

## State

| Item | Status |
| --- | --- |
| LORE-47 | **✔ Done** (merged via #18; squash `8249d9e`, chore `3f5423a`, CHANGELOG `ad8c5fe`) |
| `dev` | `ad8c5fe` == origin/dev; clean tree; checked out |
| PR #18 / branch `feat/lore-47-gitadapter-resource` | merged + branch **deleted** (local + remote) |
| Open PRs | **none** |
| Handover `HANDOVER-2026-06-26-lore-47-pr-open.md` | consumed → `archive/handovers/HANDOVER-2026-06-26-lore-47-landed.md` |
| Next task | **OPEN decision** — not chosen (Jeremy ran /handover instead of answering "next up?") |
| LORE-26 "lore sync" | **To Do** (HIGH) — owns the real GitAdapter + log.md materialization |
| LORE-20 "lore schema export" | **To Do** (MEDIUM) — prior handover's suggested next |

## Next steps

1. `backlog instructions overview`, then `backlog task list --plain`; ask Jeremy which task/track to start (HIGH core-commands vs Backlog-fork --json vs LORE-20). Don't assume.
2. On a pick: `backlog task view LORE-N --plain` → `backlog task edit LORE-N -s "In Progress" -a @claude` → new feature branch off dev → plan (`--plan`) → implement.
3. Gates then PR into dev (see paste prompt). Let Jeremy review+merge.

## Critical context / traps

- **ssh-agent is DOWN** (SSH push/fetch → `Permission denied (publickey)`). Route ALL git writes via
  the gh token: `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <branch>:<branch>`
  then `git update-ref refs/remotes/origin/<branch> <sha>`. ff dev: gh-token `fetch …/lore.git dev`,
  `git merge --ff-only FETCH_HEAD`, update-ref. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Merge convention = SQUASH** — each PR lands as one linear `feat(LORE-N): … (#PR)` commit on dev,
  followed by a `chore(LORE-N): mark Done (delivered via #N) and archive consumed handover` commit.
  No merge commits. [[lore-git-workflow]]
- **core/ stays PURE** (lore-design §2.1): no fs/spawn/clock; impurity sits behind injectable seams
  (clock, Backlog subprocess, GitAdapter) wired at the command layer. **ubuntu CI is case-SENSITIVE**;
  external-volume Bun has EXDEV/isolated-install traps. [[external-volume-bun-exdev-traps]]
- **Don't self-merge** PRs — Jeremy reviews+merges. The #18 "admin-merge" was a one-time, per-PR OK.

## Do not repeat

- **Don't create a "lore sync follow-up" task** — it already exists as LORE-26; the log.ts findings
  it would have carried were fixed in #18, not deferred.
- **Don't bare `git push`/`git fetch`** while ssh is down — gh-token route from the first call.

## System of record updated (this session)

- **LORE-47** notes → full disposition of the 13 `/code-review max` findings (each fix, file, test) +
  status set **Done**.
- **CHANGELOG.md** (Unreleased / LORE-47) → per-type resource stamp guard, the index-file `resource`
  warning, and the new advisory `lore validate` resource-drift rule (commit `ad8c5fe`).
- **Code** → PR #18 (squash `8249d9e`): per-type `acceptsStampedResource`, shared `expectedResource`,
  resource-base trim, index-aware reserved-key check, `resource` drift finding, log.ts determinism
  (canonical singleLine, root-slash normalize, cached instant / offset-aware, subject tiebreak).
  +15 tests; 506 pass; core files 100% covered.
