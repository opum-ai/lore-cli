# Handover — Codex review follow-up campaign, round 2 (this session drained waves 13 + 14: 12 issues merged + 1 resolved-by-merge; 0 escalations)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `a5f5d52` (local == origin after the final `git push`; verify with `git rev-list --left-right --count dev...origin/dev`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 14 waves complete;
84 campaign tasks Done (doc-3 Resolved rows 1-84), 0 held/in-flight, 15 in-scope tasks
remain To Do (+4 deferred LORE-42..45 in "Not queued"). This session drained wave 13
(LORE-160,152?-no: 160,163,166,169,180,186 — PRs #160-#165) and wave 14 (LORE-161,167,
170,179,184,194 — PRs #166-#171): all 12 Fable-approve (only LORE-184 needed 1 fix round),
0 escalations; both integration reviews non-blocking. Also reconciled LORE-165 as
resolved-by-merge by LORE-164. The 15 remaining To-Do: 153,168,171,172,178,181,182,183,
185,187,188,189,191,192,193. Zero formal deps among all in-scope (re-verify live via YAML
parse; only LORE-42..45 carry deps to already-Done non-campaign tasks). Queue order/scope
confirmed by user 2026-07-21, re-affirmed 2026-07-22 (medium-first, but the low follow-ups
181/182/185/187/188/189/191 are in-queue too); do NOT re-ask. The ready set is recomputed
live at restore — do NOT hardcode a next-wave list. Full wave-parallel mode (Opus + Workflow)
proven. USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable machinery in
prior scratchpad: wave14.mjs (workflow), merge-one.sh (FIXED merge queue), settle14.mjs.
NEVER build a tracker update from a piped `backlog doc view` (truncates ~98KB) — read the raw
.md, splice, verify wc -l after. Two NEW traps this session: (a) collateral TEST-file edits are
a conflict vector the source-citation graph misses; (b) the gh-merge --delete-branch worktree
gotcha (both detailed below).
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-12 | Complete (prior sessions): 71 Done incl. docker-e2e CI gate + 3 resolved-by-merge dups |
| **Round 2 wave 13 (this session)** | **COMPLETE: LORE-160,163,166,169,180,186 merged (PRs #160-#165). 6/6 Fable approve, 0 fix, 0 escalations. Base `f64dd23` → dev `bed190e`. Integration review CLEAN. Suite 1859→1872.** |
| **Round 2 wave 14 (this session)** | **COMPLETE: LORE-161,167,170,179,184,194 merged (PRs #166-#171). 6/6 Fable approve (LORE-184 after 1 fix), 0 escalations. Base `33f7f2a` → dev `fc12a2b`. Integration review non-blocking (2 info, folded into LORE-181). Suite 1874→1887.** |
| Reconciled this session | LORE-165 → Done (resolved-by-merge by LORE-164; commit `3b0ef25`, Resolved row 78). LORE-181 widened to cover LORE-161's 3rd sanitizer copy (+2 ACs). Duplicate LORE-195 archived. |
| Queue | **84 Done, 0 held/in-flight, 15 in-scope To Do** (+4 deferred LORE-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `a5f5d52` (== origin after final push). No worktrees, no `feature/*` (local/remote), no open PRs. Clean between-wave state. |

## This session's in-flight wave

None — waves 13 and 14 fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate. Proceed to R4: compute the live ready/conflict graph over the 15 in-scope To-Do and dispatch a wave (≤6 file-disjoint workers, ONE per distinct cluster — see trap below on same-cluster).
2. **Do NOT re-do waves 13/14.** All 12 are Done/merged (Resolved rows 66-84). Don't re-mint LORE-96..195.
3. **The 15 remaining To-Do and their clusters/pinned files (recompute live, but this is the last-known map):**
   - core-links-resolution **LORE-153** (`src/core/links.ts`) — ⚠️ its AC permits fixing at the finding **print site** (`src/commands/check.ts` / `src/commands/validate.ts`) instead of at message construction; it MIGHT touch check.ts. Keep it away from cmd-check **LORE-191** (`src/commands/check.ts`), or constrain it to links.ts. (validate.ts is now free — 160/161 done.)
   - core-scaffold-consumer **LORE-168** (`src/core/schema.ts`) — okf_version extra-key warning scope.
   - errors-output-git **LORE-171** (`src/errors.ts`) / **LORE-172** (`src/errors.ts`) — same file AND same cluster → serialize (pick one).
   - core-engine-a **LORE-188** (`src/adapters/git.ts`).
   - build-ci-config **LORE-178** (docs-only runbook via `lore` — `docker-e2e-testing-environment.md`, mention it's now a CI gate). Docs task: verify via `bun run src/cli.ts check`.
   - cmd-crud-b **LORE-181** (now WIDENED: `src/errors.ts` + `src/output.ts` + `src/commands/query.ts` + `src/core/validate.ts` — shared-sanitizer consolidation; broad file set, schedule carefully) / **LORE-189** (`src/commands/sync.ts`) — same cluster → serialize.
   - cmd-meta-a **LORE-182** (`src/commands/schema.ts`).
   - cmd-link **LORE-183** (`src/commands/link.ts`).
   - core-bundle-check **LORE-185** (`src/core/profile.ts` + `src/commands/new.ts`) / **LORE-192** (`src/core/bundle.ts`) / **LORE-193** (`src/core/bundle.ts` — parseItems/itemToZod empty-enum, sibling of LORE-140; reuse assertNonEmptyEnum) — same cluster → serialize; 192 & 193 both bundle.ts.
   - cmd-meta-c **LORE-187** (`src/commands/schema.ts` + `src/commands/fswrite.ts`) — NOTE: shares `src/commands/schema.ts` with cmd-meta-a **LORE-182** → cross-cluster file conflict, keep apart.
   - cmd-check **LORE-191** (`src/commands/check.ts`).
   - **A clean candidate next wave (verify live):** 153-or-168, 171, 182, 183, 192, 188 — but re-pin every file citation first, and keep 182↔187 apart (both commands/schema.ts) and 153↔191 apart (check.ts risk).
4. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **NEW — collateral TEST-file edits are a conflict vector the source-citation graph under-approximates.** Wave 14: LORE-179 (cmd-link) and LORE-184 (core-bundle-check) BOTH edited `test/rename.test.ts` even though neither cited it as a source target — because bug-fix tasks legitimately add/adjust regression tests in broad shared test files. Their hunks were disjoint (auto-merged on rebase) and the mandatory re-verify passed, so no harm — **but the serial merge-queue's rebase-onto-moving-dev + mandatory full-suite re-verify is what caught it, not the conflict graph.** Mitigation for scheduling: treat broad shared test files (`test/rename.test.ts`, `test/replace.test.ts`, `test/supersede.test.ts`, `test/link.test.ts`, `test/schema.test.ts`) as *likely-touched* by any rename/rewrite/link/supersede/replace/schema-cluster task, and never assume two such tasks are safe just because their SOURCE files differ. When in doubt, serialize.
- **NEW — `gh pr merge --delete-branch` exits NON-ZERO when a worktree still holds the local branch** (it can't delete the local ref), which aborts a `set -e` merge script mid-way EVEN THOUGH the GitHub merge succeeded (bit wave 13 for LORE-160/163 — left worktree/branch/dev-sync incomplete, reconciled manually). **Fixed `merge-one.sh` (in this session's scratchpad):** rebase → re-verify → push → ensure PR → **remove worktree + delete local branch BEFORE** `gh pr merge` → `gh pr merge <PR#> --admin --rebase` (NO `--delete-branch`) → verify state==MERGED → sync dev → `git push origin --delete` the remote branch explicitly. Ran zero-incident for all 6 of wave 14. Also: do NOT pipe the merge loop through `grep` — it masks the script's exit status from the loop's `|| break`.
- **Tracker-write discipline (unchanged, still load-bearing):** the tracker is ~98KB with an em-dash filename. Build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates on the read side), splice with a line-anchored function-replacer (`body.replace(old, () => newStr)` — never a plain string 2nd arg, `` $` ``/`$'`/`$&` are special), write body-only via `backlog doc update doc-3 --content "$CONTENT"` (pass through an ENV VAR, not `"$(cat)"` inline — the body has backticks). **After every write, diff the on-disk body against your expected file and confirm `wc -l`.** Working scripts this session: `.repro-scratch/dispatch-mark*.mjs`, `.repro-scratch/settle13.mjs`, `.repro-scratch/settle14.mjs` (all use these patterns).
- **Queue table keeps ALL tasks with Status updated in-place** (not removed); the **Resolved table** is a separate append-only evidence log (rows 1-84). Resolved-by-merge dups record the RESOLVER's wave in the Queue (e.g. LORE-165 → `Done | 12`). Two independent numberings (Queue positions vs Resolved sequence) legitimately overlap in value — don't confuse them.
- **`git` intermittently "command not found" in a for-loop/subshell** non-interactively → `GIT=/opt/homebrew/bin/git` and call `$GIT` everywhere in loops.
- **Worktree setup:** `$GIT worktree add --detach <path> "$WAVE_BASE"` then `$GIT -C <path> switch -c feature/<KEY>`. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — avoids the cross-device 0-byte bun-build trap). Each needs its own `bun install` (parallel with `&`+`wait`). Pin `WAVE_BASE = dev HEAD AFTER the dispatch-mark commit is committed+pushed`.
- **Forbid `git stash` in worker prompts** (refs/stash is repo-wide across worktrees). The wave13/14 worker prompts already say: use `git diff > patch` + `git apply -R`/`apply` for mutation-checks. Held clean both waves.
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".
- **Backlog ID minting** stays sequential, orchestrator-only, primary-checkout-only, between waves. This session minted then archived LORE-195 (a duplicate of the pre-existing LORE-181) — **always search existing tasks before filing an integration-review follow-up** (`backlog task list --status "To Do" --plain | grep <keyword>`); several consolidation/sanitizer/guard tasks already exist (LORE-181, 185).
- **The Fable review + integration review earn their keep:** wave-14 integration review caught the sanitizer triplication (→ LORE-181 widened); wave-13's confirmed serializer coherence. Budget an integration review + possible follow-up disposition every wave.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't build a tracker update from a piped `backlog doc view` — read the raw `.md`; verify on-disk `wc -l` + a body-diff after writing.
- Don't use a plain string as `String.replace`'s 2nd arg when it may contain `` $` ``/`$'`/`$&` — use `() => newStr`.
- Don't pass tracker/PR-body content containing backticks through the shell inline (`"$(cat)"`); use an env var or `--body-file`.
- Don't use `git stash` in worker/reviewer worktrees.
- Don't keep `--delete-branch` on `gh pr merge` while a worktree holds the branch, and don't pipe the merge loop through `grep` (masks exit status). Use the fixed merge-one.sh order.
- Don't assume two tasks are wave-safe because their SOURCE files differ — collateral edits to broad shared TEST files (rename/replace/link/schema/supersede) collide. Serialize same-cluster; treat shared test files as likely-touched.
- Don't co-schedule same-cluster tasks (171+172 errors.ts; 192+193 bundle.ts; 181+189 cmd-crud-b) or cross-cluster same-file (182+187 commands/schema.ts; 153+191 check.ts risk).
- Don't file an integration-review follow-up without first grepping existing To-Do tasks (LORE-195 was a dup of LORE-181).
- Don't re-mint LORE-96..195; don't dispatch LORE-165 (Done, resolved-by-merge).
- Don't re-ask scope/queue order; don't create a doc-4 (tracker is doc-3, updated in place).
- Don't grep `backlog/tasks/*.md` for deps — YAML-parse (`js-yaml` `{ load }`); false negatives on multi-line lists.
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
