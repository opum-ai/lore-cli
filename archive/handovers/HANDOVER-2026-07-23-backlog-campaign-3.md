# Handover — Codex review follow-up campaign, round 3 (low-severity) — waves 19-21 complete, 19/55 resolved

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `20beed7` (local == origin; verify `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs (PRs #187–204 all MERGED).** **Tracker**: doc-4. Biome lint baseline is now **GREEN** (LORE-195 merged).

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-4
("Backlog campaign tracker — Codex review follow-ups (round 3)"). Round 3 = doc-2's
LOW-severity findings. Waves 19, 20, 21 done this prior session: 18 tasks merged
+ LORE-206 reconciled as a duplicate = 19/55 resolved. 36 round-3 tasks remain, all To Do,
all ZERO formal deps. Queue order confirmed by user 2026-07-23 (docs-first:
docs→chore→task→enhancement→bug, cluster-mates adjacent); do NOT re-ask, do NOT re-run the
re-audit. The ready set is recomputed LIVE at restore — do NOT hardcode a next-wave list.
Readiness is gated PURELY by the live file-conflict graph (same-cluster items serialize;
zero deps). Full wave-parallel mode (Opus + Workflow) proven across rounds 1-3 (21 waves).
USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery in
.repro-scratch/: wave19/20/21-{graph,dispatch-mark,workflow,settle}.mjs + *-resolved-rows.txt
+ *-log.txt are the current templates — copy wave21-* and bump the wave number to 22, set BASE
to the pushed origin/dev SHA. Tracker file = doc-4. GATES: `bun test` (0 fail) + `bun run typecheck`
(clean); lint is GREEN now so ALSO keep it green (workers must not re-redden biome). NEVER build a
tracker update from a piped `backlog doc view` (truncates) — read the raw .md, splice line-based,
verify wc -l + `^## ` headers after. PUSH the dispatch-mark commit to origin/dev BEFORE basing
worktrees (see "Do not repeat").
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — 20 high-severity findings |
| Round 2 (doc-3, LORE-96..194) | Complete — 78 medium findings + follow-ups, 18 waves, all merged |
| **Round 3 (doc-4) — waves 19-21 done** | **19/55 resolved. 36 To Do remain, all zero deps.** |
| Wave 19 (docs-first) | LORE-198,199,200,204,208,209 merged (PR#187-192), integration clean |
| Wave 20 | LORE-201,203,205,207,195,211 merged (PR#193-198), integration clean; LORE-195 restored lint→GREEN |
| Wave 21 | LORE-202,210,212,213,214,215 merged (PR#199-204), integration clean; LORE-206 reconciled Done (dup of LORE-205) |
| Git | `dev` @ `20beed7` (== origin). No worktrees, no `feature/*`, no open PRs. Clean. Lint green. Suite 1923 pass / 0 fail. |
| Not queued | 7 needs-human findings + LORE-196 + deferred LORE-42/43/44/45 (see doc-4 "Not queued"). NOTE: LORE-45 shows as `To Do` but is a deferred-v2 item — do NOT dispatch it. |

## This session's in-flight wave

None — the session stopped cleanly BETWEEN waves after wave 21 settled. No mid-wave leftovers: all worktrees removed, all feature branches deleted (local+remote), tracker fully settled and pushed.

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (verify `0 0`, no worktrees/branches/PRs). Proceed to R4: compute the live ready/conflict graph over the 36 remaining To-Do tasks and dispatch wave 22 (≤6 file-disjoint workers, distinct clusters).
2. **R4a/R4b — build the graph from the TASK BODIES, not the tracker Note column.** Read every non-terminal task file (YAML-parse frontmatter for `dependencies`/`ordinal`/`labels`; read the BODY for the real edit target). `.repro-scratch/wave19-graph.mjs` is a ready-made frontmatter parser (gray-matter). All 36 have zero deps, so the conflict graph is the whole scheduler. **CRITICAL: the tracker's `[file]` Note column is the audit PROVENANCE citation, NOT always the edit target** — e.g. LORE-203 was cited as `src/core/context.ts` but actually edits `docs/reference/cli-surface.md`. Always read the AC text to get the true edit file(s), then `conflicts(A,B) := same cluster OR file-sets intersect`.
3. **Remaining 36 are mostly BUGS now** (the docs/chore/task/enhancement front is largely cleared; enhancements LORE-217..221 + bugs LORE-222..250 + LORE-197 + task LORE-216 remain). Bug fixes touch real `src/` code — hold the Fable bar high (this queue is itself a security/robustness review's follow-up). Several clusters have MULTIPLE bugs on the SAME file that MUST serialize: `src/commands/check.ts` (LORE-225, 226, 197 — all cmd-check), `src/adapters/backlog.ts` (217, 218, 222), `src/commands/fswrite.ts` (230, 231), `src/core/check.ts` (239, 240), `src/core/profile.ts` (241, 242), `src/commands/replace.ts` (228, 229), `src/commands/link.ts` (233, 234), `src/output.ts` (221, 250), `src/core/indexes.ts` (244). Same file → serialize across waves.
4. **Reuse the wave-21 machinery** (`.repro-scratch/wave21-*`): copy, bump wave→22, set `BASE` to the freshly-PUSHED `origin/dev` SHA, keep the Sonnet-implement → Fable-review pipeline + capped fix loop, the serial merge queue (rebase→re-verify→force-push→`gh pr merge <PR#> --rebase --admin` WITHOUT `--delete-branch`→`git reset --hard origin/dev`→worktree remove→branch -d→push --delete), and the wave-level Fable integration review.

## Critical context / traps

- **All 36 remaining tasks have ZERO formal deps** — readiness is purely the file-conflict graph. Re-verify live each restore (YAML-parse, never grep `backlog/tasks/*.md` for deps — false negatives on multi-line lists).
- **Watch for DUPLICATE findings across clusters.** LORE-206 (build-runtime) turned out to be the SAME test/helpers.ts change as LORE-205 (build-ci-config) — reconciled Done without a redundant worker. Before dispatching, sanity-check whether a task's edit target was already changed by a merged sibling; if fully satisfied on dev, reconcile it Done (verify ACs, `backlog task edit -s Done`, add a Resolved row) rather than dispatching.
- **Merge from the PRIMARY checkout, never a worktree** (post-merge cleanup fails on shared `dev`). Worktree placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — the cross-device 0-byte bun-build trap). Each worktree needs its own `bun install`. Forbid `git stash` in worker prompts (refs/stash is repo-wide across worktrees).
- **`gh pr merge --rebase --admin` prints nothing on success** — verify via the subsequent `git reset --hard origin/dev` picking up the new SHA (or `gh pr view <#>`). Admin merge bypasses the known-fine-but-slow CI (docker-e2e/ci.yml) and the (now-green) lint gate; the Fable reviewer already re-ran `bun test`+typecheck in-worktree so the merged bytes are verified.
- **Tracker-write discipline (doc-4)**: build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates), splice with LINE-BASED array ops (`.repro-scratch/wave21-dispatch-mark.mjs` / `wave21-settle.mjs` are templates), write body-only via `backlog doc update doc-4 --content "$ENVVAR"` (env var, not inline — body has backticks). After every write, verify on-disk `wc -l` + `grep -nE '^## '` (7 headers). The `--content` body INCLUDES the frontmatter block — this round-trips cleanly (proven 21 waves).
- **Backlog id-minting is sequential, orchestrator-only, primary-checkout-only, between waves.** `backlog task edit` on an existing different id per worker is parallel-safe.
- **Not-queued items** (do NOT dispatch): the 7 needs-human re-audit findings (build/CI product calls, symlink-follow bundle walk, rollback-verification design, resource_base URL-validation, golden-schema-independence), LORE-196 (docker-e2e repo-admin), LORE-42/43/44/45 (deferred v2 — LORE-45 in particular shows `To Do` but is deferred).
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Suite size grows** as tasks add tests (was 1913 at round-3 start, 1923 after wave 21). Gate on "0 fail", not an absolute pass count.

## Do not repeat

- **PUSH the dispatch-mark commit to origin/dev BEFORE creating worktrees** (or base worktrees on `origin/dev`, not local `dev`). Wave 19 based worktrees on an UNPUSHED local dispatch commit → GitHub's rebase-merge replayed it onto origin/dev under a new SHA → local/origin divergence, fixed by `git reset --hard origin/dev`. Waves 20-21 pushed the mark first and had ZERO divergence. Always push first.
- **Don't treat the tracker `[file]` Note as the edit target** — it's the audit provenance citation. Read the task BODY/ACs for the real file(s) to edit (LORE-203 cited context.ts, edited cli-surface.md).
- **Don't dispatch a worker for a task already resolved by a merged sibling/duplicate** — reconcile it Done (LORE-206 pattern).
- **Don't build a tracker update from a piped `backlog doc view`** — read the raw `.md`; verify `wc -l` + section headers after.
- **Don't pass tracker/PR-body content with backticks through the shell inline** (`--content "$(cat)"`); use an env var (`export X="$(cat file)"; ... "$X"`) or `--body-file` for PRs.
- **Don't co-schedule same-cluster tasks** or cross-cluster same-file tasks — file-citation read first (real counter-examples this round: LORE-199/203 both cli-surface.md; LORE-205/206 both test/helpers.ts).
- **Don't create a doc-5** — the round-3 tracker is doc-4, updated in place. doc-1=round1, doc-2=source review, doc-3=round2.
- **Lint is GREEN now** (LORE-195) — do NOT let a worker re-redden biome; each worker keeps its own changed files clean. The campaign still gates on `bun test`+typecheck, but lint is now a trustworthy secondary signal.
