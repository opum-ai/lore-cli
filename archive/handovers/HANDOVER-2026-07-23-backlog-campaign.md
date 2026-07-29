# Handover — Codex review follow-up campaign, round 2 (this session drained wave 15: 6 issues merged; 0 escalations)

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `094e1ff` (local == origin after the final push; verify with `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`, and three unrelated plain-handover files under `.claude/handovers/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 15 waves complete;
90 campaign tasks Done (doc-3 Resolved rows 1-90), 0 held/in-flight, 9 in-scope tasks
remain To Do (+4 deferred LCLI-42..45 in "Not queued"). This session drained wave 15
(LCLI-153,168,171,178,182,183 — PRs #172-#177, merge SHAs 14d6291/2f54906/e6af752/
9604057/3777599/cb97bc6): all 6 Fable-approve (LCLI-178 and LCLI-183 after 1 fix each),
0 escalations; integration review CLEAN (dev 1900/0, typecheck clean, lore check 38/0/0).
Also widened LCLI-181 (+AC#6) for LCLI-153's new core/links.ts sanitizer copy. The 9
remaining To-Do: 172,181,185,187,188,189,191,192,193. Zero formal deps among all in-scope
(re-verify live via YAML parse; only LCLI-42..45 carry deps to already-Done non-campaign
tasks). Queue order/scope confirmed by user 2026-07-21, re-affirmed 2026-07-22 (medium-first,
low follow-ups in-queue too); do NOT re-ask. The ready set is recomputed live at restore — do
NOT hardcode a next-wave list. Full wave-parallel mode (Opus + Workflow) proven. USE
/opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery persisted in
.repro-scratch/: wave15-graph.mjs, wave15-files.mjs (graph builders), wave15-dispatch-mark.mjs,
wave15-settle.mjs (tracker splicers), wave15-workflow.mjs (the implement+review Workflow).
KNOWN: the dev lint baseline is pre-RED (biome, 3 err + 4 info in untouched files) — gate
merges on `bun test` + typecheck, NOT `bun run lint`; surfaced to user in doc-3 "Not queued".
NEVER build a tracker update from a piped `backlog doc view` (truncates ~112KB) — read the raw
.md, splice line-based, verify wc -l + section headers after.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-14 | Complete (prior sessions): 84 Done incl. docker-e2e CI gate + 4 resolved-by-merge dups |
| **Round 2 wave 15 (this session)** | **COMPLETE: LCLI-153,168,171,178,182,183 merged (PRs #172-#177). 6/6 Fable approve (LCLI-178, LCLI-183 after 1 fix), 0 escalations. Base `ba2c12e` → dev `cb97bc6`. Integration review CLEAN. Suite 1887→1900. All 6 rebases clean, zero merge conflicts.** |
| LCLI-181 (this session) | Widened +AC#6 (fold LCLI-153's new core/links.ts sanitizer copy into the shared-sanitizer consolidation). Still To Do — now the broadest cmd-crud-b task (4 source files). |
| Queue | **90 Done, 0 held/in-flight, 9 in-scope To Do** (+4 deferred LCLI-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `094e1ff` (== origin). No worktrees, no `feature/*` (local/remote), no open PRs. Clean between-wave state. |

## This session's in-flight wave

None — wave 15 fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate. Proceed to R4: compute the live ready/conflict graph over the 9 in-scope To-Do and dispatch a wave (≤6 file-disjoint workers, ONE per distinct cluster).
2. **Do NOT re-do wave 15.** All 6 are Done/merged (Resolved rows 85-90). Don't re-mint LCLI-96..195.
3. **The 9 remaining To-Do and their clusters/pinned files (recompute live via YAML parse + file-citation read; this is the last-known map):**
   - errors-output-git **LCLI-172** (`src/errors.ts` — WarningCollector.flush normalizes multi-line/control-char warnings before stderr) — now ISOLATED (its cluster-sibling LCLI-171 is done).
   - cmd-crud-b **LCLI-181** (BROADEST: `src/output.ts` + `src/commands/query.ts` + `src/core/validate.ts` + `src/core/links.ts` — shared-sanitizer consolidation, now 6 ACs) / **LCLI-189** (`src/commands/sync.ts` + `src/core/instructions.ts`) — same cluster → serialize. **LCLI-181 conflicts with LCLI-192 on `src/core/validate.ts` and touches `src/core/links.ts`** — schedule it carefully or alone.
   - core-bundle-check **LCLI-185** (`src/core/profile.ts` + `src/commands/new.ts`) / **LCLI-192** (`src/core/validate.ts` + `src/core/bundle.ts`) / **LCLI-193** (`src/core/profile.ts` + `test/profile.test.ts`) — same cluster → serialize; 185 & 193 both `profile.ts`; 192's `validate.ts` also clashes with LCLI-181.
   - cmd-meta-c **LCLI-187** (`src/commands/schema.ts` + `src/commands/fswrite.ts`) — now FREE (its old conflict LCLI-182 on commands/schema.ts is done).
   - core-engine-a **LCLI-188** (`src/adapters/git.ts` — quote git-log docs-root pathspec with `:(literal)`) — ISOLATED.
   - cmd-check **LCLI-191** (`src/commands/check.ts` — flush discovery advisories before checkBundles can throw) — now ISOLATED (LCLI-153 was constrained off check.ts this wave).
   - **A clean candidate next wave (VERIFY LIVE):** `172, 187, 188, 191` + one of `{185, 192, 193}` + one of `{181, 189}` — e.g. {172, 187, 188, 191, 185, 189} are pairwise file-disjoint + distinct clusters (6 workers), leaving {181, 192, 193} for wave 17. But LCLI-181 is broad; consider running it alone or pairing only with non-validate.ts/non-links.ts tasks. Re-pin every file citation first.
4. **User action items (optional, non-blocking) — see doc-3 "Not queued":**
   - **NEW this wave: the `dev` lint baseline is red.** `bun run lint` (biome) fails on dev with 3 errors + 4 infos, all in files no campaign task touched (test/context.test.ts, test/replace.test.ts:1, test/validate.test.ts:1; useTemplate infos in src/core/managed-block.ts:187/:428, test/managed-block.test.ts:216, test/supersede.test.ts:85). All auto-fixable via `biome check --write`. Not a wave-15 regression (byte-identical at ba2c12e). Either run `biome check --write` + commit, or file a hygiene task. **The campaign gates merges on `bun test` + typecheck, NOT lint — do not gate on `bun run lint` or every wave stalls on this pre-existing red.**
   - docker-e2e branch protection — enable as a required check in repo settings or record as moot (unchanged from prior sessions). Agent must not change autonomously.

## Critical context / traps

- **Merge queue that ran zero-incident this wave (per branch, orchestrator-only, serial, ordinal order):** `git -C <wt> fetch origin` → `git -C <wt> rebase origin/dev` → **mandatory** re-verify in-worktree (`bun test` full suite + `bun run typecheck`; for a docs task also `bun run src/cli.ts check` = 38/0/0) → `git -C <wt> push --force-with-lease origin feature/<KEY>` → `gh pr create --base dev` → **`gh pr merge <PR#> --rebase --admin` (NO `--delete-branch`)** → `gh pr view <PR#> --json state` == MERGED → `git checkout dev && git pull --ff-only origin dev` → `git worktree remove <wt>` → `git branch -D feature/<KEY>` → `git push origin --delete feature/<KEY>`. The `--delete-branch` omission is load-bearing: with a worktree still holding the branch it exits non-zero and aborts the merge mid-way (bit wave 13).
- **Tracker-write discipline (unchanged, load-bearing):** doc-3 is ~112KB / 416 lines with an em-dash filename. Build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates on the read side), splice with LINE-BASED array operations (this session's `.repro-scratch/wave15-settle.mjs` and `wave15-dispatch-mark.mjs` are the working templates — line-array splice, not fragile nested string-replace), write body-only via `backlog doc update doc-3 --content "$CONTENT"` (pass through an ENV VAR, not `"$(cat)"` inline — the body has backticks). **After every write, verify on-disk `wc -l` AND `grep -nE '^## ' ` section headers are all intact.** For content blocks full of backticks/apostrophes, write them as plain text files via the Write tool and have the splice script read them (sidesteps all escaping) — that's how wave 15's Resolved rows / wave-log / lint-bullet were done.
- **Queue table keeps ALL tasks with Status updated in-place** (Dispatched at R4c dispatch-mark, Done at R4i settlement); the **Resolved table** is a separate append-only evidence log (rows 1-90). Queue position-numbers legitimately overlap Resolved sequence-numbers in value (a loose `grep '^| 85 |'` matches both a Queue row and a Resolved row) — key on the LORE-id + status, not the leading number.
- **`git` intermittently "command not found" in a for-loop/subshell** non-interactively → `GIT=/opt/homebrew/bin/git` and call `$GIT` everywhere in loops.
- **Worktree setup:** `$GIT worktree add --detach <path> "$WAVE_BASE"` then `$GIT -C <path> switch -c feature/<KEY>`. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — avoids the cross-device 0-byte bun-build trap). Each needs its own `bun install` (parallel with `&`+`wait`). Pin `WAVE_BASE = dev HEAD AFTER the dispatch-mark commit is committed+pushed`.
- **Conflict graph held perfectly this wave (zero collateral test-file collisions, unlike wave 14)** — every source file touched by exactly one task. Key scoping move: LCLI-153's AC allowed the fix at the check.ts/validate.ts print sites, but the worker was constrained to the `src/core/links.ts` message-construction site only, keeping it off LCLI-191's file. Still treat broad shared TEST files (`test/rename.test.ts`, `test/replace.test.ts`, `test/link.test.ts`, `test/schema.test.ts`, `test/supersede.test.ts`) as likely-touched by rename/rewrite/link/supersede/replace/schema-cluster tasks; the merge-queue rebase+re-verify is the backstop.
- **Forbid `git stash` in worker prompts** (refs/stash is repo-wide across worktrees). The wave-15 worker prompts already say: use `git diff > patch` + `git apply -R`/`apply` for mutation-checks. Held clean.
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Backlog ID minting** stays sequential, orchestrator-only, primary-checkout-only, between waves. `backlog task edit` on an EXISTING different id per worker is parallel-safe (that's how workers record Done). `backlog task edit <id> --ac "..."` ADDS an AC (used to widen LCLI-181); does NOT auto-commit — fold the dirty backlog/tasks file into the settlement commit.
- **The Fable review + integration review earn their keep:** wave-15's caught nothing cross-task (CLEAN) but confirmed the verifiedViewTask unification (LCLI-183) left no orphaned callers and the singleLine/LCLI-171 coupling was benign. Budget an integration review + possible follow-up disposition every wave.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).
- **The three `HANDOVER-2026-07-21T*Z.md` files in `.claude/handovers/`** are from the OTHER (plain `handover`) skill — different naming, not campaign artifacts. Leave them; only the `*-backlog-campaign.md` file is this campaign's active handover.

## Do not repeat

- **Don't gate merges on `bun run lint`** — the dev baseline is pre-RED (3 biome errors in untouched files). Gate on `bun test` + `bun run typecheck` only. Surface the lint baseline to the user (already in doc-3 "Not queued"); don't silently `biome check --write` it (out of campaign scope).
- Don't build a tracker update from a piped `backlog doc view` — read the raw `.md`; verify on-disk `wc -l` + section headers after writing. Prefer line-array splice over nested string-replace.
- Don't pass tracker/PR-body content containing backticks through the shell inline (`"$(cat)"`); use an env var or `--body-file`, or (for content blocks) a Write-tool text file read by the splice script.
- Don't use `git stash` in worker/reviewer worktrees.
- Don't keep `--delete-branch` on `gh pr merge` while a worktree holds the branch; use the wave-15 merge order above (tear down worktree+branch AFTER merge, delete remote explicitly).
- Don't co-schedule same-cluster tasks (181+189 cmd-crud-b; 185+192+193 core-bundle-check) or cross-cluster same-file (181↔192 on validate.ts; 185↔193 on profile.ts). LCLI-181 is the broadest remaining (4 files incl. validate.ts + links.ts) — schedule it alone or with clearly-disjoint tasks.
- Don't re-mint LCLI-96..195; don't re-dispatch LCLI-153..183 (Done, Resolved rows 85-90).
- Don't re-ask scope/queue order; don't create a doc-4 (tracker is doc-3, updated in place).
- Don't grep `backlog/tasks/*.md` for deps — YAML-parse (`js-yaml` `{ load }`); false negatives on multi-line lists.
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
