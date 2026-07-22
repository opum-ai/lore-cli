# Handover — Codex review follow-up campaign, round 2 (this session ran waves 5 + 6: 12 issues merged)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `a899109` (local == `origin/dev` after R5 push; 0/0). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 6 waves complete;
34 campaign tasks Done (doc-3 Resolved rows 1-34), 0 held/in-flight, 53 medium tasks
remain To Do. This session drained TWO full waves: wave 5 (LORE-101,104,113,117,121,123
— PRs #111-#116) and wave 6 (LORE-105,118,124,128,132,133 — PRs #117-#122). All 12 were
Fable-approved on the FIRST pass (0 fix rounds, 0 escalations); both wave-level integration
reviews returned SAFE (final suites 1738/0 then 1748/0). Filed 4 follow-ups: LORE-179
(wave 5), and LORE-180 [MEDIUM] / 181 / 182 (wave 6). Queue order confirmed by user
2026-07-21/re-affirmed 2026-07-22 (medium-only); do NOT re-ask scope or order. Zero formal
deps among the 53 To-Do (re-verified live via YAML parse; only LORE-42..45 in "Not queued"
carry deps). The ready set is recomputed live at restore — do NOT hardcode a next-wave list.
Full wave-parallel mode (Opus + Workflow) available.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-4 | Complete (prior sessions): 22 Done incl. docker-e2e CI gate (LORE-100/176) + 3 resolved-by-merge dups |
| **Round 2 wave 5 (this session)** | **COMPLETE: LORE-101,104,113,117,121,123 merged (PRs #111-#116). 6/6 Fable approve, 0 fix. Integration review SAFE (1738/0). Base `befb34e` → dev `52e3368`.** |
| **Round 2 wave 6 (this session)** | **COMPLETE: LORE-105,118,124,128,132,133 merged (PRs #117-#122). 6/6 Fable approve, 0 fix. Integration review SAFE (1748/0). Base `811c513` → dev `b67b273`.** |
| Follow-ups filed this session | LORE-179 (cmd-link, unlink/rename same-class gap), LORE-180 (**core-rewrite-engine, MEDIUM** — rewrite.ts newDestPathFor leading-slash), LORE-181 (cmd-crud-b, low — sanitizer dedup), LORE-182 (cmd-meta-a, low — win32 cross-drive --out) |
| Queue | **34 Done, 0 held/in-flight, 53 To Do.** 4 deferred (LORE-42..45) + docker-e2e branch-protection in "Not queued" |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph |
| Git | `dev` @ `a899109` (== origin). No worktrees, no `feature/*` branches, no open PRs. Clean between-wave state |

## This session's in-flight wave

None — both waves fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 53 To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do waves 5/6.** All 12 are Done/merged (Resolved rows 23-34). Don't re-mint LORE-96..182 — they exist.
3. **Cluster leaders to consider (informational only — recompute live):** build-runtime LORE-106; cmd-crud-b LORE-119/120; cmd-meta-a LORE-125 (or the low LORE-182); cmd-meta-c LORE-129/130; cmd-rename-supersede LORE-132 is done → next rename/supersede work; core-bundle-check LORE-134..140; core-engine-a/b, core-index-context, core-links-resolution, core-managed-template, core-query-validate, core-replace, core-rewrite-engine (LORE-164/165 **+ the new LORE-180, all conflict on rewrite.ts — pick ONE per wave**), core-scaffold-consumer, errors-output-git; follow-ups LORE-174/175/177/178/179/181. Many clusters → a wave easily fills 6 file-disjoint items.
4. **Conflict hints now in the Queue table** for the follow-ups: LORE-180 ↔ LORE-164/165 (rewrite.ts); LORE-181 touches output.ts; LORE-182 ↔ other schema.ts tasks; LORE-177/179 ↔ LORE-121-area link.ts. Respect them in the R4b graph.
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **Tracker doc updates REPLACE THE WHOLE body.** `backlog doc update doc-3 --content "$(cat body)"` — extract body via `backlog doc view doc-3 --plain | tail -n +8` (strips the 7-line frontmatter; CLI re-manages it), edit surgically in scratchpad, feed back. `auto_commit: false` — commit backlog/ writes explicitly, `:(literal)`-quoting the em-dash/space pathspec.
- **`lore` is NOT on the non-interactive shell PATH** (the worker's interactive shell had it linked). Invoke via `bun run src/cli.ts <cmd>` from within the repo/worktree (bin is `src/cli.ts`). `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **`gh pr merge --delete-branch` does NOT delete the remote branch in this repo.** After each merge, explicitly `git push origin --delete feature/LORE-<K>` (the merge-queue steps already do this). It also fails to delete the *local* branch while the worktree holds it — order is: sync dev → `git worktree remove` → `git branch -d` → `git push origin --delete`.
- **Merge queue re-verify is mandatory even on a clean rebase.** Every wave-6 rebase was clean (file-disjoint) yet each got a full `bun test` + typecheck in its worktree before merge. Suite grew 1731→1748 as tests accreted across the wave — expected.
- **Worktree setup:** plain sequential `git worktree add --detach <path> <BASE>` then `git -C <path> switch -c feature/<KEY>`; NO `cd`+`set -e`+redirection in one script (phantom `command not found: git`). Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (same filesystem — avoids the cross-device 0-byte trap). Each TS worktree needs its own `bun install` (~1s, warm cache); docker/bash-only tasks (e.g. LORE-105) don't.
- **Docker tasks:** the `e2e-e2e` image + buildx cache are WARM; only ONE `docker compose` at a time (project name `e2e` collides). A wave can hold at most one docker task safely. Cheap verification (isolated function extraction / throwaway compose) beats a full `up --build` (~minutes) when it objectively satisfies the AC — wave 5 (LORE-104) and wave 6 (LORE-105) both used the cheap path successfully.
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only.** Minted LORE-179..182 that way. NEVER from a worktree (separate backlog/ checkout = collision vector).
- **R4b is load-bearing.** Resolve every bare filename to a real path; over-approximate conflicts. Wave 5's LORE-117(fswrite)↔LORE-123(schema) was kept disjoint by scoping 123 to the EXISTING `writeFileNoFollow` seam. Note shared low-level modules that many tasks gravitate to: `src/commands/fswrite.ts` (writeFileAtomic/moveFile/writeFileNoFollow/writeAllOrRollback), `src/output.ts` (stripAnsiAndControls), `src/state.ts`, `src/core/rewrite.ts` — put at most one task touching each per wave.
- **Workflow orchestration that worked:** `wave{5,6}.mjs` in scratchpad — a `pipeline(TASKS, implement(sonnet), review(fable)+cappedFixLoop)` returning structured verdicts; the orchestrator then runs the serial merge queue in Bash and a single `agent(model:'fable')` wave-integration review. Reusable template for the next wave (copy, swap BASE/TASKS). Read only the workflow output's `result` array (lines before `"workflowProgress"`) to save context.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement/re-merge any of LORE-101,104,113,117,121,123,105,118,124,128,132,133 — all Done/merged (Resolved rows 23-34).
- Don't re-run `backlog task create` for LORE-96..182 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists).
- Don't put two tasks touching the same shared module (fswrite.ts / output.ts / state.ts / rewrite.ts) in one wave — LORE-180 and LORE-164/165 all touch rewrite.ts.
- Don't run two docker compose harness runs at once (shared `e2e-e2e` image/container) — serialize.
- Don't set docker-e2e branch protection autonomously — repo-admin, outward-facing, user's call.
- Don't treat the wave-6 "session stops" as an escalation — clean context checkpoint (R4j); nothing is blocked.
