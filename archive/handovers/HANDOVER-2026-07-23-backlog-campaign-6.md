# Handover — Codex review follow-up campaign, round 3 (low-severity) — wave 25 complete, 43/55 resolved

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `5b9d6f1` (local == origin; verify `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs (PRs #223–228 all MERGED).** **Tracker**: doc-4. Biome lint GREEN (109 files); full suite 1987 pass / 0 fail; `tsc --noEmit` clean.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-4
("Backlog campaign tracker — Codex review follow-ups (round 3)"). Round 3 = doc-2's
LOW-severity findings. Wave 25 done this prior session: 6 tasks merged
(231/234/235/237/239/243) = 43/55 resolved. 12 round-3 tasks remain, all To Do, all ZERO
formal deps. Queue order confirmed by user 2026-07-23 (docs-first: docs→chore→task→
enhancement→bug, cluster-mates adjacent); do NOT re-ask, do NOT re-run the re-audit. The
ready set is recomputed LIVE at restore — do NOT hardcode a next-wave list. Readiness is
gated PURELY by the live file+test-conflict graph (all zero deps). Full wave-parallel mode
(Opus + Workflow) proven across rounds 1-3 (25 waves, all clean, zero divergence).
USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery in
.repro-scratch/: wave25-{dispatch-mark,workflow,settle}.mjs + wave25-{resolved-rows,log}.txt
are the CURRENT templates — copy wave25-* and bump the wave number to 26, set BASE to the
freshly-PUSHED origin/dev SHA (the workflow's BASE const is a plain string — set it to the
dispatch-marked origin/dev SHA). Tracker file = doc-4. GATES: `bun test` (0 fail, currently
1987) + `bun run typecheck` (clean); lint is GREEN (109 files) so keep it green. NEVER build
a tracker update from a piped `backlog doc view` (truncates) — read the raw .md, splice
line-based, verify wc -l + `^## ` headers (7) after. PUSH the dispatch-mark commit to
origin/dev BEFORE basing worktrees.

CONFLICT GOTCHAS for the remaining 12 (file-citation read of the TASK BODY, not the tracker
Note column — the Note is audit provenance, not always the edit target):
(1) errors.ts TRIO — LORE-236 (cmd-meta-a, WarningCollector.flush), LORE-249 (errors-output-git,
    stderrHint), LORE-250 (errors-output-git, output.ts+cli.ts, MAY touch errors.ts for the
    reportError/flush color plumbing) — schedule AT MOST ONE of {236,249,250} per wave. (249/250
    are also same-cluster, so they serialize regardless.)
(2) test/query.test.ts COLLATERAL — LORE-232 (edits src/commands/query.ts) and LORE-246 (edits
    src/core/query.ts) touch DIFFERENT source files but BOTH add to test/query.test.ts → serialize
    them into different waves (source-file graph alone misses this).
(3) same-cluster/same-file — LORE-240 (src/core/check.ts) is a core-bundle-check singleton now
    (239 merged); LORE-241 + LORE-242 BOTH edit src/core/profile.ts (core-bundle-check) → serialize.
(4) Verified NON-conflicts (do NOT over-serialize): LORE-247 edits ONLY src/core/rewrite.ts (guard
    before normalizeLink) — does NOT edit core/links.ts, so it does NOT conflict with LORE-245
    (core/links.ts); LORE-243 (done) never edited git.ts/sync.ts. LORE-244 edits ONLY
    core/indexes.ts (imports frontmatterScalar from bundle.ts, does not edit bundle.ts).
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete — 20 high-severity findings |
| Round 2 (doc-3, LORE-96..194) | Complete — 78 medium findings + follow-ups, 18 waves |
| **Round 3 (doc-4) — waves 19-25 done** | **43/55 resolved. 12 To Do remain, all zero deps.** |
| Waves 19-24 (prior sessions) | 37 resolved (see doc-4 wave log). |
| Wave 25 (this session) | LORE-231,234,235,237,239,243 merged (PR#223-228), integration review clean |
| Git | `dev` @ `5b9d6f1` (== origin). No worktrees, no `feature/*`, no open PRs. Clean. Lint green (109 files). Suite 1987 pass / 0 fail. |
| Not queued | 7 needs-human findings + LORE-196 + deferred LORE-42/43/44/45 (see doc-4 "Not queued"). LORE-45 shows `To Do` but is deferred-v2 — do NOT dispatch it. |

## This session's in-flight wave

None — the session stopped cleanly BETWEEN waves after wave 25 settled (context-pressure checkpoint, one wave done). No mid-wave leftovers: all 6 worktrees removed, all feature branches deleted (local+remote), tracker fully settled and pushed, consumed handover archived (`5b9d6f1`).

## The 12 remaining To-Do tasks (all zero deps — the conflict graph is the whole scheduler)

Grouped by cluster (same-cluster ⇒ serialize; one per wave). `[file]` is the TRUE edit target from the AC body (READ THE AC to confirm — the tracker Note column is provenance, not always the edit target):
- **cmd-crud-b**: LORE-232 (src/commands/query.ts — trim --type/--status/--tag values; adds to test/query.test.ts).
- **cmd-meta-a**: LORE-236 (src/errors.ts — strip ANSI/OSC/control on WarningCollector.flush; **errors.ts trio**).
- **core-bundle-check**: LORE-240 (src/core/check.ts — leading indented code block in frontmatter-free files; may also touch core/concept.ts normalizeInput), LORE-241 (src/core/profile.ts — non-object profile.json error), LORE-242 (src/core/profile.ts — validate default vs kind/enum). 241/242 same file ⇒ serialize; all three same cluster ⇒ one per wave.
- **core-index-context**: LORE-244 (src/core/indexes.ts — conceptTitle numeric/boolean coercion via frontmatterScalar).
- **core-links-resolution**: LORE-245 (src/core/links.ts — validateLink flags bare '.'/'..' destinations).
- **core-query-validate**: LORE-246 (src/core/query.ts — matchesField resolves case-insensitive key across ALL variants; adds to test/query.test.ts ⇒ **serialize vs LORE-232**).
- **core-rewrite-engine**: LORE-247 (src/core/rewrite.ts — preserve above-repo-root outbound links during rename; edits ONLY rewrite.ts).
- **core-scaffold-consumer**: LORE-248 (src/core/schema.ts — warnSummary counts UTF-16 not chars for non-BMP).
- **errors-output-git**: LORE-249 (src/errors.ts — stderrHint control-seq strip + length cap; **errors.ts trio**), LORE-250 (src/output.ts + src/cli.ts, maybe src/errors.ts — suppress ANSI on non-TTY stderr; **errors.ts trio**). 249/250 same cluster ⇒ serialize.

An illustrative ≤6-worker wave 26 (RECOMPUTE LIVE — this is NOT a plan): one-per-cluster, file+test-disjoint, ordinal order → LORE-232, 236, 240, 244, 245, 247 (cmd-crud-b / cmd-meta-a / core-bundle-check / core-index-context / core-links-resolution / core-rewrite-engine). That would leave 241, 242, 246, 248, 249, 250 for later waves (note 241+242 can't co-wave; 249+250 can't co-wave; so the tail is ~2-3 waves, shrinking as clusters drain).

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (verify `0 0`, no worktrees/branches/PRs). Proceed to R4: compute the live ready/conflict graph over the 12 remaining To-Do tasks and dispatch wave 26 (≤6 file+test-disjoint workers, distinct clusters).
2. **R4a/R4b — build the graph from the TASK BODIES, not the tracker Note column.** All 12 have zero deps (re-verify via YAML parse), so the file+test conflict graph is the whole scheduler. Read each candidate's AC text for the true edit file(s) AND the test file(s) it adds to, then `conflicts(A,B) := same cluster OR source-files intersect OR test-files intersect`. The errors.ts trio (236/249/250) and the test/query.test.ts pair (232/246) are the two live cross-cluster gotchas this round has left.
3. **Reuse the wave-25 machinery** (`.repro-scratch/wave25-*`): copy, bump wave→26, set the workflow `BASE` const to the freshly-PUSHED origin/dev SHA, keep the Sonnet-implement → Fable-review pipeline + capped fix loop, the serial merge queue, and the wave-level Fable integration review.

## Critical context / traps

- **All 12 remaining tasks have ZERO formal deps** — readiness is purely the file+test-conflict graph. Re-verify live each restore (YAML-parse frontmatter, never grep `backlog/tasks/*.md` for deps — false negatives on multi-line lists). Filenames are lowercase `lore-NNN - ...md` (match `lore-${n} -`, the frontmatter id is `LORE-NNN`).
- **Cross-cluster same-file / same-test-file conflicts this round**: errors.ts trio 236/249/250 (never co-schedule >1); test/query.test.ts pair 232/246 (serialize). Same-cluster/same-file: 241/242 both core/profile.ts.
- **Read the AC BODY for the edit target, not the tracker Note.** Proven this round: LORE-232's Note cites core/query.ts but it edits commands/query.ts; LORE-247 edits only rewrite.ts (not links.ts, despite citing it); LORE-243 never edited git.ts/sync.ts (unchanged callers). Over-approximate only when a filename is genuinely ambiguous.
- **Merge from the PRIMARY checkout, never a worktree.** Worktree placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — cross-device 0-byte bun-build trap). Each worktree needs its own `bun install` (~1s each, parallel-safe). Forbid `git stash` in worker prompts (refs/stash is repo-wide across worktrees).
- **Merge recipe (proven waves 22-25, zero divergence)**: per branch in queue order — `git -C <wt> fetch origin` → `git -C <wt> rebase origin/dev` → **mandatory re-verify in worktree** (`bun test` 0 fail + `bun run typecheck` clean, even if rebase was a no-op) → `git -C <wt> push --force-with-lease origin feature/<KEY>` → `gh pr create` → `gh pr merge feature/<KEY> --rebase --admin` (prints nothing on success) → `git fetch origin && git reset --hard origin/dev` in primary → `git worktree remove <wt>` → `git branch -d feature/<KEY>` → `git push origin --delete feature/<KEY>`.
- **`gh pr merge --rebase --admin` bypasses the slow-but-fine CI (docker-e2e) and lint gate** — the Fable reviewer re-ran `bun test`+typecheck in-worktree, and the orchestrator re-verifies again after each rebase, so the merged bytes are verified. Verify merge success via the subsequent `git reset --hard origin/dev` picking up the new SHA.
- **Tracker-write discipline (doc-4)**: build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates), splice with LINE-BASED array ops (`.repro-scratch/wave25-dispatch-mark.mjs` / `wave25-settle.mjs` are templates), write body-only via `backlog doc update doc-4 --content "$ENVVAR"` (env var, not inline — body has backticks). After every write, verify on-disk `wc -l` + `grep -nE '^## '` (7 headers). The `--content` body INCLUDES the frontmatter block — round-trips cleanly (proven 25 waves). CLI normalizes trailing newline (±1 line is fine).
- **Backlog id-minting is sequential, orchestrator-only, primary-checkout-only, between waves.** `backlog task edit` on an existing different id per worker is parallel-safe.
- **Not-queued items** (do NOT dispatch): the 7 needs-human re-audit findings, LORE-196 (docker-e2e repo-admin), LORE-42/43/44/45 (deferred v2 — LORE-45 shows `To Do` but is deferred).
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Suite size grows** as tasks add tests (1973 at wave-25 start → 1987 after wave 25). Gate on "0 fail", not an absolute pass count.
- **Concurrency helper location (post-LORE-233, relevant to LORE-235-like tasks — 235 now DONE):** `mapWithConcurrency` + `TASK_DETAILS_CONCURRENCY` live in `src/commands/concurrency.ts` (dependency-free); `reconcile-shared.ts` re-exports for back-compat. If any remaining task needs bounded fan-out, import from `./concurrency`.

## Do not repeat

- **PUSH the dispatch-mark commit to origin/dev BEFORE creating worktrees** (or base worktrees on `origin/dev`). Wave 19 diverged by basing on an unpushed local mark; waves 20-25 pushed first → ZERO divergence.
- **Don't treat the tracker `[file]` Note as the edit target** — it's audit provenance. Read the task BODY/ACs for the real file(s) AND the test file(s). (Wave 25 confirmed LORE-232 edits commands/query.ts not core/query.ts, LORE-247 edits only rewrite.ts.)
- **Don't co-schedule the errors.ts trio (236/249/250)** or the test/query.test.ts pair (232/246) or any same-cluster pair — file+test-citation read first.
- **Don't build a tracker update from a piped `backlog doc view`** — read the raw `.md`; verify `wc -l` + section headers (7) after.
- **Don't pass tracker/PR-body content with backticks through the shell inline** — use an env var (`export X="$(cat file)"; ... "$X"`) or `--body-file` for PRs.
- **Don't create a doc-5** — the round-3 tracker is doc-4, updated in place. doc-1=round1, doc-2=source review, doc-3=round2.
- **Lint is GREEN (109 files)** — do NOT let a worker re-redden biome; each worker keeps its own changed files clean.
- **`git mv` an active handover fails** (they're gitignored) — the archive step falls back to plain `mv` + `git add <dest>` (archive/handovers/ is tracked). Expected, not an error.
