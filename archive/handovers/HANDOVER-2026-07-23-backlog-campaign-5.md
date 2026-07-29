# Handover — Codex review follow-up campaign, round 3 (low-severity) — wave 24 complete, 37/55 resolved

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `83234a9` (local == origin; verify `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs (PRs #217–222 all MERGED).** **Tracker**: doc-4. Biome lint GREEN (109 files); full suite 1972 pass / 0 fail; `tsc --noEmit` clean.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-4
("Backlog campaign tracker — Codex review follow-ups (round 3)"). Round 3 = doc-2's
LOW-severity findings. Wave 24 done this prior session: 6 tasks merged
(222/197/229/230/233/238) = 37/55 resolved. 18 round-3 tasks remain, all To Do, all ZERO
formal deps. Queue order confirmed by user 2026-07-23 (docs-first: docs→chore→task→
enhancement→bug, cluster-mates adjacent); do NOT re-ask, do NOT re-run the re-audit. The
ready set is recomputed LIVE at restore — do NOT hardcode a next-wave list. Readiness is
gated PURELY by the live file-conflict graph (same-cluster items serialize; zero deps).
Full wave-parallel mode (Opus + Workflow) proven across rounds 1-3 (24 waves, all clean).
USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery in
.repro-scratch/: wave24-{dispatch-mark,workflow,settle}.mjs + wave24-{resolved-rows,log}.txt
are the CURRENT templates — copy wave24-* and bump the wave number to 25, set BASE to the
freshly-PUSHED origin/dev SHA (the workflow's BASE const is a plain string — set it to the
dispatch-marked origin/dev SHA). Tracker file = doc-4. GATES: `bun test` (0 fail, currently
1972) + `bun run typecheck` (clean); lint is GREEN (109 files) so keep it green. NEVER build
a tracker update from a piped `backlog doc view` (truncates) — read the raw .md, splice
line-based, verify wc -l + `^## ` headers (7) after. PUSH the dispatch-mark commit to
origin/dev BEFORE basing worktrees.

TWO cross-cluster conflicts to respect when building wave 25 (file-citation read, not cluster
label): (1) LCLI-236 (cmd-meta-a) and LCLI-249 (errors-output-git) BOTH edit src/errors.ts →
serialize them into different waves. (2) LCLI-235 (cmd-meta-a) is now UNBLOCKED (its wave-24
blocker LCLI-233 merged) but MUST import mapWithConcurrency + TASK_DETAILS_CONCURRENCY from
the NEW src/commands/concurrency.ts (LCLI-233 relocated them there; reconcile-shared.ts only
re-exports them for back-compat). Also: LCLI-237 (validate.ts) is PARTIALLY pre-satisfied by
merged LCLI-228 (which already added --strict=<value> rejection) — 237's residual is
repeated-`--strict`/repeated-`--type` rejection; read validate.ts on dev before dispatching.
Filename trap: LCLI-232 = src/commands/query.ts, LCLI-246 = src/core/query.ts — DIFFERENT
files (resolve the full path, they do NOT conflict).
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete — 20 high-severity findings |
| Round 2 (doc-3, LCLI-96..194) | Complete — 78 medium findings + follow-ups, 18 waves |
| **Round 3 (doc-4) — waves 19-24 done** | **37/55 resolved. 18 To Do remain, all zero deps.** |
| Waves 19-23 (prior sessions) | 31 resolved (see doc-4 wave log). |
| Wave 24 (this session) | LCLI-222,197,229,230,233,238 merged (PR#217-222), integration review clean |
| Git | `dev` @ `83234a9` (== origin). No worktrees, no `feature/*`, no open PRs. Clean. Lint green (109 files). Suite 1972 pass / 0 fail. |
| Not queued | 7 needs-human findings + LCLI-196 + deferred LCLI-42/43/44/45 (see doc-4 "Not queued"). LCLI-45 shows `To Do` but is deferred-v2 — do NOT dispatch it. |

## This session's in-flight wave

None — the session stopped cleanly BETWEEN waves after wave 24 settled (context-pressure checkpoint, one wave done). No mid-wave leftovers: all 6 worktrees removed, all feature branches deleted (local+remote), tracker fully settled and pushed (`83234a9`).

## The 18 remaining To-Do tasks (all zero deps — conflict graph is the whole scheduler)

Grouped by cluster (same-cluster ⇒ serialize; one per wave). `[file]` is the TRUE edit target from the AC text (not always the tracker Note's provenance citation — READ THE AC to confirm):
- **cmd-crud-b**: LCLI-231 (src/commands/fswrite.ts — writeFileAtomic leaks an uncleaned temp file on mid-write failure), LCLI-232 (src/commands/query.ts — trim --type/--status/--tag values). Same cluster ⇒ serialize.
- **cmd-link**: LCLI-234 (src/commands/link.ts — runLink doc-membership check is exact-case while unlink's is case-insensitive → casing-variant entry duplicates instead of dedups).
- **cmd-meta-a**: LCLI-235 (src/commands/tasks.ts — bound resolveRollup fan-out; **import the shared cap from src/commands/concurrency.ts**, NOT reconcile-shared.ts), LCLI-236 (src/errors.ts — strip ANSI/OSC/control on WarningCollector.flush stderr; **shares errors.ts with LCLI-249**). Same cluster ⇒ serialize.
- **cmd-meta-b**: LCLI-237 (src/commands/validate.ts — reject repeated `--strict`/repeated `--type`; the `--strict=<value>` half is ALREADY done by merged LCLI-228 — scope to the residual).
- **core-bundle-check**: LCLI-239 + LCLI-240 (src/core/check.ts — callout false-positive; leading indented code block), LCLI-241 + LCLI-242 (src/core/profile.ts — non-object profile.json error; validate default vs kind/enum). 239/240 same file; 241/242 same file; all same cluster ⇒ one per wave.
- **core-engine-a**: LCLI-243 (src/core/log.ts — harden resolveRoot against equivalent bundle roots).
- **core-index-context**: LCLI-244 (src/core/indexes.ts — index.md conceptTitle numeric/boolean coercion via frontmatterScalar).
- **core-links-resolution**: LCLI-245 (src/core/links.ts — validateLink flags bare '.'/'..' destinations).
- **core-query-validate**: LCLI-246 (src/core/query.ts — matchesField resolves case-insensitive key across ALL variants). NOTE: core/query.ts ≠ commands/query.ts (LCLI-232).
- **core-rewrite-engine**: LCLI-247 (src/core/rewrite.ts — preserve above-repo-root outbound links during rename).
- **core-scaffold-consumer**: LCLI-248 (src/core/schema.ts — warnSummary counts UTF-16 not chars for non-BMP).
- **errors-output-git**: LCLI-249 (src/errors.ts — stderrHint control-seq strip + length cap; **shares errors.ts with LCLI-236**), LCLI-250 (src/output.ts — suppress ANSI on non-TTY stderr). Same cluster ⇒ serialize.

An illustrative ≤6-worker wave 25 (RECOMPUTE LIVE — this is NOT a plan): one-per-cluster, file-disjoint, ordinal order → LCLI-231, 234, 235, 237, 239, 243 (cmd-crud-b / cmd-link / cmd-meta-a / cmd-meta-b / core-bundle-check / core-engine-a). Respect the two conflicts in the paste-ready prompt.

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (verify `0 0`, no worktrees/branches/PRs). Proceed to R4: compute the live ready/conflict graph over the 18 remaining To-Do tasks and dispatch wave 25 (≤6 file-disjoint workers, distinct clusters).
2. **R4a/R4b — build the graph from the TASK BODIES, not the tracker Note column.** All 18 have zero deps (re-verify via YAML parse), so the conflict graph is the whole scheduler. Read each candidate's AC text for the true edit file(s), then `conflicts(A,B) := same cluster OR file-sets intersect`. The errors.ts pair (236/249) and the concurrency.ts import note (235) are the two live cross-cluster gotchas this round has left.
3. **Reuse the wave-24 machinery** (`.repro-scratch/wave24-*`): copy, bump wave→25, set the workflow `BASE` const to the freshly-PUSHED origin/dev SHA, keep the Sonnet-implement → Fable-review pipeline + capped fix loop, the serial merge queue, and the wave-level Fable integration review.

## Critical context / traps

- **All 18 remaining tasks have ZERO formal deps** — readiness is purely the file-conflict graph. Re-verify live each restore (YAML-parse frontmatter, never grep `backlog/tasks/*.md` for deps — false negatives on multi-line lists).
- **Cross-cluster same-file conflict this round**: LCLI-236 (cmd-meta-a) + LCLI-249 (errors-output-git) BOTH edit `src/errors.ts` → never co-schedule. Same-cluster/same-file pairs: fswrite is done, but 231 (fswrite.ts) vs the merged 230 is fine (230 merged); 239/240 (core/check.ts), 241/242 (core/profile.ts) same file; 231/232 same cluster cmd-crud-b; 235/236 same cluster cmd-meta-a; 249/250 same cluster errors-output-git.
- **LCLI-233 relocated the concurrency helper**: `mapWithConcurrency` + `TASK_DETAILS_CONCURRENCY` now live in `src/commands/concurrency.ts` (dependency-free, avoids the link→reconcile-shared→link cycle). `reconcile-shared.ts` re-exports them for back-compat (its own resolveTaskDetails + check.ts's probeLiveness are the live consumers). LCLI-235 should import from `./concurrency`.
- **Merge from the PRIMARY checkout, never a worktree.** Worktree placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — cross-device 0-byte bun-build trap). Each worktree needs its own `bun install` (~1.1s each, parallel-safe). Forbid `git stash` in worker prompts (refs/stash is repo-wide across worktrees).
- **Merge recipe (proven waves 22-24, zero divergence)**: per branch in queue order — `git -C <wt> fetch origin` → `git -C <wt> rebase origin/dev` → **mandatory re-verify in worktree** (`bun test` 0 fail + `bun run typecheck` clean, even if rebase was a no-op) → `git -C <wt> push --force-with-lease origin feature/<KEY>` → `gh pr create` → `gh pr merge feature/<KEY> --rebase --admin` (prints nothing on success) → `git fetch origin && git reset --hard origin/dev` in primary → `git worktree remove <wt>` → `git branch -d feature/<KEY>` → `git push origin --delete feature/<KEY>`.
- **`gh pr merge --rebase --admin` bypasses the slow-but-fine CI (docker-e2e) and lint gate** — the Fable reviewer re-ran `bun test`+typecheck in-worktree, and the orchestrator re-verifies again after each rebase, so the merged bytes are verified. Verify merge success via the subsequent `git reset --hard origin/dev` picking up the new SHA.
- **Tracker-write discipline (doc-4)**: build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates), splice with LINE-BASED array ops (`.repro-scratch/wave24-dispatch-mark.mjs` / `wave24-settle.mjs` are templates), write body-only via `backlog doc update doc-4 --content "$ENVVAR"` (env var, not inline — body has backticks). After every write, verify on-disk `wc -l` + `grep -nE '^## '` (7 headers). The `--content` body INCLUDES the frontmatter block — round-trips cleanly (proven 24 waves).
- **Backlog id-minting is sequential, orchestrator-only, primary-checkout-only, between waves.** `backlog task edit` on an existing different id per worker is parallel-safe.
- **Not-queued items** (do NOT dispatch): the 7 needs-human re-audit findings, LCLI-196 (docker-e2e repo-admin), LCLI-42/43/44/45 (deferred v2 — LCLI-45 shows `To Do` but is deferred).
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Suite size grows** as tasks add tests (1959 at wave-24 start → 1972 after wave 24). Gate on "0 fail", not an absolute pass count.

## Do not repeat

- **PUSH the dispatch-mark commit to origin/dev BEFORE creating worktrees** (or base worktrees on `origin/dev`). Wave 19 diverged by basing on an unpushed local mark; waves 20-24 pushed first → ZERO divergence.
- **Don't treat the tracker `[file]` Note as the edit target** — it's audit provenance. Read the task BODY/ACs for the real file(s). (Wave 24 caught LCLI-236's real target = errors.ts, not tasks.ts, this way.)
- **Don't co-schedule LCLI-236 with LCLI-249** (both edit errors.ts) or any same-cluster pair — file-citation read first.
- **Don't dispatch LCLI-235 assuming the concurrency helper is in reconcile-shared.ts** — it moved to src/commands/concurrency.ts (LCLI-233).
- **Don't dispatch LCLI-237 for the full arg-parser hardening** — the `--strict=<value>` half is already merged (LCLI-228); scope the worker to the repeated-flag residual.
- **Don't build a tracker update from a piped `backlog doc view`** — read the raw `.md`; verify `wc -l` + section headers (7) after.
- **Don't pass tracker/PR-body content with backticks through the shell inline** — use an env var (`export X="$(cat file)"; ... "$X"`) or `--body-file` for PRs.
- **Don't create a doc-5** — the round-3 tracker is doc-4, updated in place. doc-1=round1, doc-2=source review, doc-3=round2.
- **Lint is GREEN (109 files)** — do NOT let a worker re-redden biome; each worker keeps its own changed files clean.
