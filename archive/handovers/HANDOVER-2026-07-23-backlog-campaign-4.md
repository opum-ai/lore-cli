# Handover — Codex review follow-up campaign, round 3 (low-severity) — waves 22-23 complete, 31/55 resolved

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `5daf0e8` (local == origin; verify `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs (PRs #205–216 all MERGED).** **Tracker**: doc-4. Biome lint is GREEN (108 files); full suite 1959 pass / 0 fail.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-4
("Backlog campaign tracker — Codex review follow-ups (round 3)"). Round 3 = doc-2's
LOW-severity findings. Waves 22 + 23 done this prior session: 12 tasks merged
(216/217/219/223/225/227 + 218/220/221/224/226/228) = 31/55 resolved. 24 round-3 tasks
remain, all To Do, all ZERO formal deps. Queue order confirmed by user 2026-07-23 (docs-first:
docs→chore→task→enhancement→bug, cluster-mates adjacent); do NOT re-ask, do NOT re-run the
re-audit. The ready set is recomputed LIVE at restore — do NOT hardcode a next-wave list.
Readiness is gated PURELY by the live file-conflict graph (same-cluster items serialize;
zero deps). Full wave-parallel mode (Opus + Workflow) proven across rounds 1-3 (23 waves).
USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery in
.repro-scratch/: wave23-{dispatch-mark,workflow,settle}.mjs + wave23-{resolved-rows,log}.txt
are the current templates — copy wave23-* and bump the wave number to 24, set BASE to the
freshly-PUSHED origin/dev SHA (the workflow script has a __WAVE_BASE__ sentinel you sed-replace).
Tracker file = doc-4. GATES: `bun test` (0 fail, currently 1959) + `bun run typecheck` (clean);
lint is GREEN so keep it green. NEVER build a tracker update from a piped `backlog doc view`
(truncates) — read the raw .md, splice line-based, verify wc -l + `^## ` headers (7) after.
PUSH the dispatch-mark commit to origin/dev BEFORE basing worktrees.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete (prior sessions) — 20 high-severity findings |
| Round 2 (doc-3, LCLI-96..194) | Complete — 78 medium findings + follow-ups, 18 waves, all merged |
| **Round 3 (doc-4) — waves 19-23 done** | **31/55 resolved. 24 To Do remain, all zero deps.** |
| Waves 19-21 (prior sessions) | 19 resolved (18 merged + LCLI-206 dup). See doc-4 wave log. |
| Wave 22 (this session) | LCLI-216,217,219,223,225,227 merged (PR#205-210), integration clean |
| Wave 23 (this session) | LCLI-218,220,221,224,226,228 merged (PR#211-216), integration clean |
| Git | `dev` @ `5daf0e8` (== origin). No worktrees, no `feature/*`, no open PRs. Clean. Lint green. Suite 1959 pass / 0 fail. |
| Not queued | 7 needs-human findings + LCLI-196 + deferred LCLI-42/43/44/45 (see doc-4 "Not queued"). NOTE: LCLI-45 shows as `To Do` but is a deferred-v2 item — do NOT dispatch it. |

## This session's in-flight wave

None — the session stopped cleanly BETWEEN waves after wave 23 settled (context-pressure checkpoint, 2 waves done). No mid-wave leftovers: all worktrees removed, all feature branches deleted (local+remote), tracker fully settled and pushed.

## The 24 remaining To-Do tasks (all zero deps — conflict graph is the whole scheduler)

Grouped by cluster (same-cluster ⇒ serialize; one per wave). Note column `[file]` is audit PROVENANCE, not always the edit target — READ THE AC TEXT for the true file(s):
- **errors-output-git**: LCLI-249 (src/errors.ts — stripHint control-seq + length cap), LCLI-250 (src/output.ts — suppress ANSI on non-TTY stderr). Both same cluster ⇒ serialize; also 250 shares src/output.ts with the merged 221.
- **adapter-backlog**: LCLI-222 (src/adapters/backlog.ts — map spawn-rejections on ALL backlog calls to typed LoreErrors, not just probe --version).
- **cli-entry-state**: (none left — 223, 224 merged).
- **cmd-check**: LCLI-226 done; LCLI-197 (src/commands/check.ts — discovery advisories lost when a later root throws in collectBundles, LCLI-191 residual).
- **cmd-crud-a**: LCLI-229 (src/commands/replace.ts — sanitize discovered file paths in the report, strip ANSI/control).
- **cmd-crud-b**: LCLI-230 + LCLI-231 (src/commands/fswrite.ts — existingIsRegularFile masks non-ENOENT lstat; writeFileAtomic temp-file leak), LCLI-232 (src/commands/query.ts — trim --type/--status/--tag values). 230/231 same file.
- **cmd-link**: LCLI-233 + LCLI-234 (src/commands/link.ts — bound viewTask fan-out concurrency; case-insensitive doc-membership dedup). Same file.
- **cmd-meta-a**: LCLI-235 (src/commands/reconcile-shared.ts — bound resolveRollup fan-out), LCLI-236 (src/commands/tasks.ts — strip ANSI/OSC on WarningCollector.flush stderr).
- **cmd-meta-b**: LCLI-237 (src/commands/validate.ts — reject --strict=<value>/repeated --strict/repeated --type). NOTE: LCLI-228 (merged) already added --strict inline-value rejection to validate.ts — CHECK whether 237 is now partially satisfied before dispatching; it also wants repeated-flag rejection which 228 did not add.
- **cmd-meta-c**: LCLI-238 (src/commands/scaffold.ts — differentiate --force structural-dir-blocker conflict hint).
- **core-bundle-check**: LCLI-239 + LCLI-240 (src/core/check.ts — callout false-positive; leading indented code block), LCLI-241 + LCLI-242 (src/core/profile.ts — non-object profile.json error; validate default against kind/enum). 239/240 same file; 241/242 same file; all same cluster ⇒ one per wave.
- **core-engine-a**: LCLI-243 (src/core/log.ts — harden resolveRoot against equivalent bundle roots).
- **core-index-context**: LCLI-244 (src/core/indexes.ts — index.md conceptTitle numeric/boolean coercion via frontmatterScalar).
- **core-links-resolution**: LCLI-245 (src/core/links.ts — validateLink flags bare '.'/'..' destinations).
- **core-query-validate**: LCLI-246 (src/core/query.ts — matchesField resolves case-insensitive key across ALL variants).
- **core-rewrite-engine**: LCLI-247 (src/core/rewrite.ts — preserve above-repo-root outbound links during rename).
- **core-scaffold-consumer**: LCLI-248 (src/core/schema.ts — warnSummary counts UTF-16 not chars for non-BMP).

A ≤6-worker wave picking one-per-cluster in queue order (#-column) would naturally be roughly: LCLI-222, 197, 229, 230, 232, 233 (adapter-backlog / cmd-check / cmd-crud-a / cmd-crud-b / [232 is same cluster as 230 → skip] cmd-link / cmd-meta-a …). RECOMPUTE LIVE — this is illustrative only.

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (verify `0 0`, no worktrees/branches/PRs). Proceed to R4: compute the live ready/conflict graph over the 24 remaining To-Do tasks and dispatch wave 24 (≤6 file-disjoint workers, distinct clusters).
2. **R4a/R4b — build the graph from the TASK BODIES, not the tracker Note column.** All 24 have zero deps (re-verify via YAML parse), so the conflict graph is the whole scheduler. Read each candidate's AC text for the true edit file(s), then `conflicts(A,B) := same cluster OR file-sets intersect`.
3. **Reuse the wave-23 machinery** (`.repro-scratch/wave23-*`): copy, bump wave→24, set BASE to the freshly-PUSHED origin/dev SHA (workflow has a `__WAVE_BASE__` sentinel: `sed -i '' "s/__WAVE_BASE__/$SHA/" wave24-workflow.mjs`), keep the Sonnet-implement → Fable-review pipeline + capped fix loop, the serial merge queue, and the wave-level Fable integration review.
4. **Watch LCLI-237 vs merged LCLI-228**: 228 already added `--strict=<value>` rejection to validate.ts; 237 wants that PLUS repeated-`--strict`/repeated-`--type` rejection. Before dispatching 237, read validate.ts on dev to see what remains — 237 may be partially pre-satisfied.

## Critical context / traps

- **All 24 remaining tasks have ZERO formal deps** — readiness is purely the file-conflict graph. Re-verify live each restore (YAML-parse frontmatter, never grep `backlog/tasks/*.md` for deps — false negatives on multi-line lists).
- **Same-file / same-cluster serialization for the remaining bugs**: `src/commands/fswrite.ts` (230, 231), `src/core/check.ts` (239, 240), `src/core/profile.ts` (241, 242), `src/commands/link.ts` (233, 234), `src/commands/check.ts` (197), `src/output.ts` (250), `src/errors.ts` (249). Same cluster ⇒ one per wave regardless of file.
- **Merge from the PRIMARY checkout, never a worktree.** Worktree placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — cross-device 0-byte bun-build trap). Each worktree needs its own `bun install`. Forbid `git stash` in worker prompts (refs/stash is repo-wide across worktrees).
- **Merge recipe (proven waves 22-23, zero divergence)**: per branch in queue order — `git -C <wt> fetch origin` → `git -C <wt> rebase origin/dev` → **mandatory re-verify in worktree** (`bun test` 0 fail + `bun run typecheck` clean, even if rebase was a no-op) → `git -C <wt> push --force-with-lease origin feature/<KEY>` → `gh pr create` → `gh pr merge feature/<KEY> --rebase --admin` (prints nothing on success) → `git fetch origin && git reset --hard origin/dev` in primary → `git worktree remove <wt>` → `git branch -d feature/<KEY>` → `git push origin --delete feature/<KEY>`.
- **`gh pr merge --rebase --admin` bypasses the slow-but-fine CI (docker-e2e) and lint gate** — the Fable reviewer already re-ran `bun test`+typecheck in-worktree, and the orchestrator re-verifies again after each rebase, so the merged bytes are verified. Verify merge success via the subsequent `git reset --hard origin/dev` picking up the new SHA.
- **Tracker-write discipline (doc-4)**: build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates), splice with LINE-BASED array ops (`.repro-scratch/wave23-dispatch-mark.mjs` / `wave23-settle.mjs` are templates), write body-only via `backlog doc update doc-4 --content "$ENVVAR"` (env var, not inline — body has backticks). After every write, verify on-disk `wc -l` + `grep -nE '^## '` (7 headers). The `--content` body INCLUDES the frontmatter block — round-trips cleanly (proven 23 waves).
- **Backlog id-minting is sequential, orchestrator-only, primary-checkout-only, between waves.** `backlog task edit` on an existing different id per worker is parallel-safe.
- **Not-queued items** (do NOT dispatch): the 7 needs-human re-audit findings (build/CI product calls, symlink-follow bundle walk, rollback-verification design, resource_base URL-validation, golden-schema-independence), LCLI-196 (docker-e2e repo-admin), LCLI-42/43/44/45 (deferred v2 — LCLI-45 in particular shows `To Do` but is deferred).
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Suite size grows** as tasks add tests (1923 at wave-22 start → 1959 after wave 23). Gate on "0 fail", not an absolute pass count.
- **Non-defect noted by wave-23 integration review** (no task filed): 3 pre-existing `.length`-based padEnd sites (help.ts:97/100/130, instructions.ts:176, orphans.ts:420) — all ASCII-by-construction, the residual sites if display-width alignment (LCLI-221) is ever wanted repo-wide.

## Do not repeat

- **PUSH the dispatch-mark commit to origin/dev BEFORE creating worktrees** (or base worktrees on `origin/dev`, not local `dev`). Waves 19 diverged by basing on an unpushed local mark; waves 20-23 pushed first and had ZERO divergence. Always push first.
- **Don't treat the tracker `[file]` Note as the edit target** — it's the audit provenance citation. Read the task BODY/ACs for the real file(s).
- **Don't dispatch a worker for a task already resolved (or partially pre-satisfied) by a merged sibling** — reconcile Done (LCLI-206 pattern), or scope the worker to only the residual (see LCLI-237 vs 228 note above).
- **Don't build a tracker update from a piped `backlog doc view`** — read the raw `.md`; verify `wc -l` + section headers (7) after.
- **Don't pass tracker/PR-body content with backticks through the shell inline** (`--content "$(cat)"`); use an env var (`export X="$(cat file)"; ... "$X"`) or `--body-file` for PRs.
- **Don't co-schedule same-cluster tasks** or cross-cluster same-file tasks — file-citation read first.
- **Don't create a doc-5** — the round-3 tracker is doc-4, updated in place. doc-1=round1, doc-2=source review, doc-3=round2.
- **Lint is GREEN** — do NOT let a worker re-redden biome; each worker keeps its own changed files clean.
