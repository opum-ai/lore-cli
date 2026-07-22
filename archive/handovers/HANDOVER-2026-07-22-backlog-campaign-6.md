# Handover — Codex review follow-up campaign, round 2 (this session ran wave 7: 6 issues merged)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `822d340` (local == `origin/dev` after settlement push; archive commit `822d340` is one ahead of the pushed `e34d082` — see Next steps step 0). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 7 waves complete;
40 campaign tasks Done (doc-3 Resolved rows 1-40), 0 held/in-flight, 48 tasks remain To Do.
This session drained wave 7 (LORE-106,175,174,177,119,125 — PRs #123-#128). All 6 were
Fable-approved on the FIRST pass (0 fix rounds, 0 escalations). Wave-level integration review:
FINDINGS_PRESENT (no blocking/high) — filed LORE-183 (medium) for the moveBackRefs unguarded
viewTask consumer + id-check triplication. Queue order confirmed by user 2026-07-21/re-affirmed
2026-07-22 (medium-only); do NOT re-ask scope or order. Zero formal deps among the 48 To-Do
(re-verify live via YAML parse; only LORE-42..45 in "Not queued" carry deps, to non-campaign
tasks). The ready set is recomputed live at restore — do NOT hardcode a next-wave list.
Full wave-parallel mode (Opus + Workflow) available.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-6 | Complete (prior sessions): 34 Done incl. docker-e2e CI gate (LORE-100/176) + 3 resolved-by-merge dups |
| **Round 2 wave 7 (this session)** | **COMPLETE: LORE-106,175,174,177,119,125 merged (PRs #123-#128). 6/6 Fable approve, 0 fix, 0 escalations. Integration review FINDINGS_PRESENT (no blocking/high). Base `2daf649` → dev `723d458` (settlement `e34d082`, archive `822d340`).** |
| Follow-up filed this session | **LORE-183 (cmd-link, MEDIUM)** — moveBackRefs (link.ts:~432) is a genuine 4th UNGUARDED viewTask consumer (write-path gap in `lore rename`) + de-dup the id-check triplicated across link.ts/tasks.ts/reconcile-shared.ts + fix stale verifiedViewTask doc comment |
| Queue | **40 Done, 0 held/in-flight, 48 To Do.** 4 deferred (LORE-42..45) + docker-e2e branch-protection in "Not queued" |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph |
| Git | `dev` @ `822d340` (== origin except the archive commit — push it, step 0). No worktrees, no `feature/*` branches, no open PRs. Clean between-wave state |

## This session's in-flight wave

None — wave 7 fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

0. **`git push origin dev`** first — the archive commit `822d340` is one ahead of the pushed settlement `e34d082` (R5 wrote the handover before this final push). Everything else is already on origin.
1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 48 To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do wave 7.** All 6 are Done/merged (Resolved rows 35-40). Don't re-mint LORE-96..183 — they exist.
3. **Cluster leaders to consider (informational only — recompute live):** build-runtime (only follow-ups left there now); cmd-crud-b LORE-120 (sync multi-file rollback) / LORE-181; cmd-meta-a LORE-182 (low, schema.ts); cmd-meta-c LORE-129/130; **core-bundle-check LORE-134..140 (7 items, all one cluster → serialize; pick ONE per wave)**; core-concept-manifest LORE-141; core-engine-a LORE-142/143/144; core-engine-b LORE-145/146/147; core-index-context LORE-148/149/150; core-links-resolution LORE-151/152/153; core-managed-template LORE-154..157; core-query-validate LORE-158..161; core-replace LORE-162/163; core-rewrite-engine LORE-164/165 **+ LORE-180 — all conflict on rewrite.ts, pick ONE**; core-scaffold-consumer LORE-166/167/168; errors-output-git LORE-169..172; follow-ups LORE-178 (docs-only via lore), 179, 181, 182, **183**. Many clusters → a wave easily fills 6 file-disjoint items.
4. **Conflict hints for the follow-ups (respect in R4b):** LORE-183 ↔ LORE-177-area/LORE-125/LORE-179 (link.ts + tasks.ts); LORE-180 ↔ LORE-164/165 (rewrite.ts); LORE-181 touches query.ts + output.ts; LORE-182 ↔ other schema.ts (LORE-124-area) tasks; LORE-179 ↔ link.ts; LORE-178 docs-only (no code conflict).
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.
6. **Open user question from this session (non-blocking):** the user interrupted mid-wave asking "what you deleting?" — answered (nothing; only post-merge worktree/branch pruning of campaign scaffolding). They were offered the option to keep merged worktrees/branches instead of pruning; no reply yet. Default behavior (prune) was used. If they want pruning skipped in future waves, honor it.

## Critical context / traps

- **Tracker doc updates REPLACE THE WHOLE body.** `backlog doc update doc-3 --content "$(cat body)"` — extract body via `backlog doc view doc-3 --plain | tail -n +8` (strips the 7-line frontmatter; CLI re-manages it), edit surgically in scratchpad, feed back. `auto_commit: false` — commit backlog/ writes explicitly; the tracker filename has an em-dash — `git add backlog/` catches it.
- **`gh pr merge` MUST be run from the primary checkout (`cd /Volumes/external/repos/lore`), NOT from inside a worktree.** Running it with cwd inside a worktree fails `gh`'s post-merge local cleanup with `fatal: 'dev' is already used by worktree` (dev is checked out in the primary). The MERGE still succeeds on GitHub in that case — verify via `gh pr view <N> --json state` before assuming failure. (Wave 7 LORE-106 hit this; the rest ran from primary and were clean apart from the expected `--delete-branch` local-branch warning, which the manual prune handles.)
- **`gh pr merge --admin --rebase --delete-branch`** is the merge (repo owner = jeremy-newhouse; --admin bypasses any required check). `--delete-branch` DELETES THE REMOTE branch but fails to delete the LOCAL branch while the worktree holds it — order: sync dev → `git worktree remove` → `git branch -d` → `git push origin --delete feature/LORE-<K>` (the explicit remote delete is belt-and-suspenders; in wave 7 it succeeded, meaning --delete-branch had NOT already removed the remote — always run it).
- **Merge queue re-verify is mandatory even on a clean rebase.** Every wave-7 rebase was clean (file-disjoint) yet each got full `bun test` + `bun run typecheck` in its worktree before merge. Suite grew 1765→1771 across the wave — expected.
- **`lore` is NOT on the non-interactive shell PATH.** Invoke via `bun run src/cli.ts <cmd>` from within the repo/worktree (bin is `src/cli.ts`; `bun run lore` also works). `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **Worktree setup:** plain sequential `git worktree add --detach <path> <BASE>` then `git -C <path> switch -c feature/<KEY>`; NO `cd`+`set -e`+redirection in one script (phantom `command not found: git`). Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem as the symlink-resolved repo `/Volumes/external/repos/lore` — avoids the cross-device 0-byte bun-build trap; note the user's `/Users/jdnewhouse/repos/lore` is an ALIAS to this). Each TS worktree needs its own `bun install` (~1s warm cache).
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only.** Minted LORE-183 that way. NEVER from a worktree (separate backlog/ checkout = collision vector). Workers only `backlog task edit` their OWN task (safe in parallel).
- **R4b is load-bearing.** Resolve every bare filename to a real path; over-approximate conflicts. Wave 7 had zero cross-cluster overlap; integration review confirmed 18 changed files each once. Shared low-level modules many tasks gravitate to (put at most ONE per wave): `src/commands/fswrite.ts`, `src/output.ts`, `src/state.ts`, `src/core/rewrite.ts`, `src/commands/reconcile-shared.ts` (id-check helper — LORE-183 may hoist here), `src/commands/link.ts`.
- **Integration-review lesson (wave 7):** two workers (LORE-177 link.ts, LORE-125 tasks.ts) INDEPENDENTLY re-implemented LORE-122's id-mismatch guard because single-task review can't see siblings — byte-identical today but a triplication-drift risk. The wave-level Fable review is exactly what catches this; it upgraded a per-task low (doc-comment nit) to a medium after confirming moveBackRefs is a real unguarded write-path consumer → LORE-183. Keep budgeting the integration review; it earns its keep.
- **Workflow orchestration that worked:** `wave7.mjs` in scratchpad — `pipeline(TASKS, implement(sonnet), reviewLoop(fable review + capped 2-retry sonnet-fix loop))` returning structured verdicts (approve/request_changes/escalate); the orchestrator then runs the serial merge queue in Bash + a single `agent(model:'fable')` wave-integration review (dispatched via the Agent tool, model:fable, subagent_type general-purpose). Reusable template for the next wave (copy, swap WAVE_BASE/TASKS, re-verify file citations). Read only the workflow output's `result` array to save context; the persisted `tool-results/*.txt` path can go stale — read the task `.output` file directly if so.
- **doc-1** = round-1 record. **doc-2** = source Codex review (backlog/docs/reviews/). The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement/re-merge LORE-106,175,174,177,119,125 — all Done/merged (Resolved rows 35-40).
- Don't re-run `backlog task create` for LORE-96..183 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists).
- Don't put two tasks touching the same shared module in one wave (fswrite.ts / output.ts / state.ts / rewrite.ts / link.ts / reconcile-shared.ts). LORE-183, 179, 177-area all touch link.ts; LORE-180 + 164/165 all touch rewrite.ts.
- Don't run `gh pr merge` from inside a worktree (see traps) — always from the primary checkout.
- Don't set docker-e2e branch protection autonomously — repo-admin, outward-facing, user's call.
- Don't treat the wave-7 "session stops" as an escalation — clean context checkpoint (R4j); nothing is blocked. The medium LORE-183 is a normal queued follow-up, not a human_needed item.
