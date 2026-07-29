# Handover — Codex review follow-up campaign, round 2 (this session ran wave 10: 6 issues merged, 2 follow-ups filed)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `739728e` (local == `origin/dev` after final push). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 10 waves complete;
58 campaign tasks Done (doc-3 Resolved rows 1-58), 0 held/in-flight, 36 in-scope tasks
remain To Do (+4 deferred LCLI-42..45 in "Not queued"). This session drained wave 10
(LCLI-137,143,146,149,155,158 — PRs #141-#146, all Fable-approve on first pass, 0 fix, 0
escalations). Filed 2 low follow-ups from the wave-10 integration review: LCLI-188 (:(literal)-
quote git.ts pathspec) + LCLI-189 (stale sync.ts:30-31 doc contradicting LCLI-146). Queue order
confirmed by user 2026-07-21/re-affirmed 2026-07-22 (medium-only); do NOT re-ask scope or order.
Zero formal deps among all 36 in-scope To-Do (re-verify live via YAML parse; only LCLI-42..45
carry deps, to already-Done non-campaign tasks). The ready set is recomputed live at restore —
do NOT hardcode a next-wave list. Full wave-parallel mode (Opus + Workflow) available and proven
this session. USE /opt/homebrew/bin/git (absolute path) inside any for-loop/subshell — bare `git`
intermittently hits "command not found" in the non-interactive shell.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-9 | Complete (prior sessions): 52 Done incl. docker-e2e CI gate + 3 resolved-by-merge dups |
| **Round 2 wave 10 (this session)** | **COMPLETE: LCLI-137,143,146,149,155,158 merged (PRs #141-#146). 6/6 Fable approve, 0 fix, 0 escalations. Integration review SAFE. Base `73f24dc` → dev `36604a9`; settlement `0dcc947`, archive `739728e`.** |
| Follow-ups filed this session | LCLI-188 (core-engine-a, low — `:(literal)`-quote git.ts docs-root pathspec), LCLI-189 (cmd-crud-b, low — fix stale sync.ts:30-31 module doc contradicting LCLI-146) — both in Queue as To Do |
| Queue | **58 Done, 0 held/in-flight, 36 in-scope To Do** (+4 deferred LCLI-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `739728e` (== origin). No worktrees, no `feature/*` branches, no open PRs. Clean between-wave state. Suite **1818 pass / 0 fail**, typecheck clean, `lore check` 38/0/0. |

## This session's in-flight wave

None — wave 10 fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 36 in-scope To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do wave 10.** All 6 are Done/merged (Resolved rows 53-58). Don't re-mint LCLI-96..189 — they exist.
3. **Cluster leaders to consider (informational only — recompute live):** core-bundle-check LCLI-138 (check.ts bodyText) / 140 (profile.ts) / 184 (bundle.ts+rewrite.ts+supersede.ts, **medium**) / 185 (profile.ts+new.ts) — serialize, pick ONE; core-engine-a LCLI-144 (scaffold.ts serializeStructuralConcept) + 188 (git.ts); core-engine-b LCLI-147 (instructions.ts check-topic); core-index-context LCLI-150 (indexes.ts generateIndexes) + 186 (indexes.ts+managed-block.ts, **medium**) — both indexes.ts, serialize; core-links-resolution LCLI-151/152/153 (all links.ts, and they CITE check.ts — serialize + keep off any check.ts wave); core-managed-template LCLI-156 (managed-block.ts) / 157 (template.ts); core-query-validate LCLI-159/160/161 (all validate.ts — serialize, pick ONE); core-replace LCLI-162 (replace.ts+indexes.ts) / 163 (replace.ts); core-rewrite-engine LCLI-164/165/180 + 184 (all rewrite.ts — serialize, pick ONE); core-scaffold-consumer LCLI-166 (consumer-scaffold.ts) / 167 / 168 (167+168 both schema.ts — serialize); errors-output-git LCLI-169/170 (git.ts) + 171/172 (errors.ts); cmd-link LCLI-179 / 183 (both link.ts — serialize); cmd-crud-b LCLI-181 (output.ts+query.ts) / 189 (sync.ts); cmd-meta-a LCLI-182 (schema.ts); cmd-meta-c LCLI-187 (schema.ts+fswrite.ts); build-ci-config LCLI-178 (docs-only runbook via lore).
4. **Conflict hints — busiest shared modules (put at most ONE per wave):** `src/core/check.ts` (138/151/152/153/168), `src/core/rewrite.ts` (164/165/180/184), `src/core/links.ts` (151/152/153), `src/core/validate.ts` (159/160/161), `src/core/schema.ts` (167/168/182/187), `src/core/indexes.ts` (150/162/186), `src/adapters/git.ts` (169/170/188), `src/core/managed-block.ts` (156/186), `src/commands/link.ts` (179/183), `src/core/profile.ts` (140/185), `src/errors.ts` (171/172), `src/commands/sync.ts` (150/189). A clean example next wave (verify live): 138, 144, 147, 150, 156, 159 — six disjoint clusters/files.
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **`git` intermittently "command not found" inside a for-loop / subshell** in the non-interactive shell (hit twice this session: worktree creation + would recur in the merge-queue loops). A `git` in a `$(...)` at the top of a script can work while the same binary fails inside a later `for` body of the same invocation. Fix: use the absolute path `GIT=/opt/homebrew/bin/git` and call `$GIT` everywhere in loops. Proven reliable.
- **Tracker doc updates REPLACE THE WHOLE body.** `backlog doc update doc-3 --content "$(cat body)"` — extract body via `backlog doc view doc-3 --plain | tail -n +8` (strips the 7-line frontmatter; CLI re-manages it), edit surgically in scratchpad (a `.mjs` string-replace script with `must()` assertions works well), feed back. `auto_commit: false` — commit backlog/ writes explicitly; the tracker filename has an em-dash — `git add backlog/` catches it. Maintain BOTH the Queue table (Status column, flip Dispatched→Done, keep the short description) AND the separate Resolved table (per-task evidence rows).
- **`gh pr merge` MUST be run from the primary checkout, NOT a worktree** (else `gh`'s post-merge local cleanup fails with `cannot delete branch ... used by worktree`). The MERGE still succeeds on GitHub — verify via `gh pr view <N> --json state`. The "failed to delete local branch" line is expected and harmless.
- **`--delete-branch` does NOT reliably delete the remote branch here.** After `gh pr merge --admin --rebase --delete-branch`, run an explicit `git push origin --delete feature/LORE-<K>`. Local branch delete order: sync dev → `git worktree remove` → `git branch -d` (the `--delete-branch` local step fails while the worktree holds the branch — expected).
- **Merge queue re-verify is mandatory even on a clean rebase.** Every wave-10 rebase was clean (file-disjoint) yet each got full `bun test` + `bun run typecheck` in its worktree before merge. Suite grew 1810→1818.
- **`lore` is NOT on the non-interactive shell PATH.** Invoke via `bun run src/cli.ts <cmd>`. `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **Worktree setup:** `$GIT worktree add --detach <path> "$WAVE_BASE"` then `$GIT -C <path> switch -c feature/<KEY>`. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem as the symlink-resolved repo — avoids the cross-device 0-byte bun-build trap). Each worktree needs its own `bun install` (~1s warm cache; run all 6 in parallel with `&`+`wait`). Pin `WAVE_BASE = dev HEAD after the dispatch-mark commit is committed+pushed`, so all workers fork identically.
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only.** Minted LCLI-188/189 that way, between waves, via `backlog task create` (labels `codex-review-followup,<cluster>`, `--priority low`, `--type bug`, `--ordinal`). Use SINGLE-quoted args for any text with backticks. NEVER from a worktree. Workers only `backlog task edit` their OWN task.
- **The Fable review loop + integration review earn their keep.** Wave 10 was cleaner than 8/9 (0 fix rounds, 0 premise inversions) but the integration review still added value: an exhaustive caller-sweep of LCLI-143's changed `history()`/`buildLog` signature (all correct) and two low follow-ups (LCLI-188/189). The integration review's cross-task-drift hunt is worth budgeting every wave.
- **LCLI-158 pattern (premise already satisfied by an earlier merge):** the codex finding's fix had already landed via LCLI-118 (wave 6); the worker correctly reduced the task to the one missing regression test (id-from-path gap) rather than re-implementing. Same class as wave-9 LCLI-136. Expect a few more of these among the remaining 34 originals — trust the worker+review when a diff shrinks to test-only, but confirm the test discriminates (mutation check).
- **Workflow orchestration that worked:** `wave10.mjs` in scratchpad — `pipeline(TASKS, implement(sonnet), reviewLoop(fable review + capped 2-retry sonnet-fix loop))` returning structured verdicts; orchestrator then runs the serial merge queue in Bash + a single `agent(model:'fable', subagent_type:'claude')` wave-integration review. Reusable template: copy, swap meta.name/WAVE_BASE/TASKS, re-verify file citations. Read the workflow output's `.result` array via a small python/bun parse (the file is under tasks/<id>.output as `{summary, result:[...]}`), don't re-read the whole blob.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement/re-merge the 6 wave-10 issues — all Done/merged (Resolved rows 53-58).
- Don't re-run `backlog task create` for LCLI-96..189 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists). Use `js-yaml` **named import** `{ load }` (repo + bun-cached both honor it).
- Don't put two tasks touching the same shared module in one wave (busiest list above). Same-cluster is also a sufficient conflict condition — serialize same-cluster items.
- Don't trust a task's file citations at face value — the description regex over-collects context-only paths (check.ts/bundle.ts get cited by link/validate tasks that don't edit them). Pin the true edit target by locating the actual symbol (`grep -rn "function <name>" src/`) before building the conflict graph.
- Don't run `gh pr merge` from inside a worktree; don't forget the explicit remote-branch-delete sweep after merging.
- Don't use bare `git` in a for-loop — use `$GIT=/opt/homebrew/bin/git`.
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
- Don't treat the wave-10 "session stops" as an escalation — clean context checkpoint (R4j); nothing is blocked. LCLI-188/189 are normal queued low follow-ups.
