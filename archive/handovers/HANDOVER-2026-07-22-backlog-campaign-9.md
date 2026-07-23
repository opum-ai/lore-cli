# Handover — Codex review follow-up campaign, round 2 (this session ran wave 11: 6 issues + 1 integration-fix merged, 2 follow-ups filed)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `6d8a076` (local == `origin/dev` after final push). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 11 waves complete;
65 campaign tasks Done (doc-3 Resolved rows 1-65), 0 held/in-flight, 32 in-scope tasks
remain To Do (+4 deferred LORE-42..45 in "Not queued"). This session drained wave 11
(LORE-138,144,147,150,151,156 — PRs #147-#152, all Fable-approve on first pass, 0 fix, 0
escalations) PLUS one integration follow-up LORE-190 (PR #153, 1 fix round). Filed 2 more follow-ups still To Do: LORE-191 (cmd-check, low — flush discovery
advisories before checkBundles can throw) + LORE-192 (core-bundle-check, medium — loadBundle
profile asymmetry, sibling of LORE-144). Queue order confirmed by user 2026-07-21/re-affirmed
2026-07-22 (medium-only); do NOT re-ask scope or order. Zero formal deps among all 32 in-scope
To-Do (re-verify live via YAML parse; only LORE-42..45 carry deps, to already-Done non-campaign
tasks). The ready set is recomputed live at restore — do NOT hardcode a next-wave list. Full
wave-parallel mode (Opus + Workflow) available and proven this session. USE
/opt/homebrew/bin/git (absolute path) inside any for-loop/subshell — bare `git` intermittently
hits "command not found" in the non-interactive shell.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-10 | Complete (prior sessions): 58 Done incl. docker-e2e CI gate + 3 resolved-by-merge dups |
| **Round 2 wave 11 (this session)** | **COMPLETE: LORE-138,144,147,150,151,156 merged (PRs #147-#152). 6/6 Fable approve, 0 fix, 0 escalations. Integration review FINDINGS_PRESENT (behavior composes cleanly; 1 medium + 2 low + 2 info). Base `43c9415` → dev `048470c`.** |
| **Wave-11 integration follow-up (this session)** | **LORE-190 (medium) FIXED same session: PR #153, dev @ `c11ef0e`, Fable approve after 1 fix round (first pass over-corrected into a falsely-exhaustive claim; re-review caught it).** |
| Follow-ups filed this session | LORE-190 (core-engine-b, medium — check/sync validation-cause + marker-shape prose drift) **DONE**; LORE-191 (cmd-check, low — advisory flush before scan-phase throw) **To Do**; LORE-192 (core-bundle-check, medium — loadBundle profile asymmetry, LORE-144 sibling) **To Do** |
| Queue | **65 Done, 0 held/in-flight, 32 in-scope To Do** (+4 deferred LORE-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `6d8a076` (== origin). No worktrees, no `feature/*` branches, no open PRs. Clean between-wave state. Suite **1845 pass / 0 fail**, typecheck clean, `lore check` 38/0/0. |

## This session's in-flight wave

None — wave 11 + the LORE-190 integration follow-up fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 32 in-scope To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do wave 11.** All 6 + LORE-190 are Done/merged (Resolved rows 59-65). Don't re-mint LORE-96..192 — they exist.
3. **Cluster leaders to consider (informational only — recompute live):** core-bundle-check LORE-140 (profile.ts, parseFieldSpec empty enum) / 184 (bundle.ts+rewrite.ts+supersede.ts, **medium**) / 185 (profile.ts+new.ts) / 192 (bundle.ts, **medium**, LORE-144 sibling) — serialize, pick ONE; core-rewrite-engine LORE-164/165/180 + 184 (all rewrite.ts — serialize, pick ONE); core-links-resolution LORE-152/153 (both links.ts, and 153 CITEs check.ts — serialize + keep off any check.ts wave); core-query-validate LORE-159/160/161 (all validate.ts — serialize, pick ONE); core-scaffold-consumer LORE-166 (consumer-scaffold.ts) / 167 / 168 (167+168 both schema.ts — serialize); errors-output-git LORE-169/170 (git.ts) + 171/172 (errors.ts); core-managed-template LORE-157 (template.ts); core-replace LORE-162 (replace.ts+indexes.ts) / 163 (replace.ts); cmd-link LORE-179 / 183 (both link.ts — serialize); cmd-crud-b LORE-181 (output.ts+query.ts) / 189 (sync.ts); cmd-meta-a LORE-182 (schema.ts); cmd-meta-c LORE-187 (schema.ts+fswrite.ts); cmd-check LORE-191 (commands/check.ts, low — advisory flush); build-ci-config LORE-178 (docs-only runbook via lore). A clean example next wave (verify live): 140, 157, 159, 162, 166, 169 — six disjoint clusters/files (profile.ts / template.ts / validate.ts / replace.ts+indexes.ts / consumer-scaffold.ts / git.ts).
4. **Conflict hints — busiest shared modules (put at most ONE per wave):** `src/core/rewrite.ts` (164/165/180/184), `src/core/validate.ts` (159/160/161), `src/core/schema.ts` (167/168/182/187), `src/core/links.ts` (152/153), `src/core/bundle.ts` (184/192), `src/core/indexes.ts` (162), `src/core/profile.ts` (140/185), `src/errors.ts` (171/172), `src/adapters/git.ts` (169/170), `src/commands/link.ts` (179/183), `src/commands/sync.ts` (189), `src/commands/check.ts` (191). **Same-cluster = sufficient conflict → serialize.** Note 153 & 191 both CITE `src/core/check.ts`/`commands/check.ts` as context — verify they don't actually EDIT it (pin the real symbol) before pairing with a check task.
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **`git` intermittently "command not found" inside a for-loop / subshell** in the non-interactive shell. Fix: `GIT=/opt/homebrew/bin/git` and call `$GIT` everywhere in loops. Proven reliable again this session (worktree setup + all 7 merge-queue runs).
- **Reusable merge-queue script:** `scratchpad/merge-one.sh <TASKNUM> "<title>" "<body>"` — rebase onto origin/dev → mandatory re-verify (typecheck + `bun test`) in the worktree → `push --force-with-lease` → `gh pr create` + `gh pr merge --admin --rebase --delete-branch` (run from PRIMARY, not worktree) → sync dev → explicit `git push origin --delete` → `worktree remove` → `branch -D`. All 7 merges this session used it; every rebase was clean (file-disjoint) yet each got full re-verify before merge. The "failed to delete local branch ... used by worktree" line from `gh` is EXPECTED and harmless (PR still MERGED — the script removes the worktree + branch itself afterward).
- **Reusable wave workflow:** `scratchpad/wave11.mjs` — `pipeline(TASKS, implement(sonnet, agentType:'claude'), reviewLoopWithCappedFix(fable))` returning structured verdicts; orchestrator then runs the serial merge queue in Bash + a single `agent(model:'fable', subagent_type:'claude')` wave-integration review. Copy, swap meta.name / TASKS / pinned edit-targets, re-verify file citations live. Parse the workflow `.output` via a small bun script (`scratchpad/parse-result.mjs`) — don't re-read the whole blob.
- **Tracker doc updates REPLACE THE WHOLE body.** Extract body via `backlog doc view doc-3 --plain | tail -n +8`, edit surgically in scratchpad with a `.mjs` string-replace script using `must()` assertions (`scratchpad/settle.mjs` + `scratchpad/dispatch-mark.mjs` are this session's working templates), feed back via `backlog doc update doc-3 --content "$(cat body)"`. `auto_commit: false` — commit `backlog/` explicitly; the tracker filename has an em-dash so `git add backlog/` catches it. Maintain BOTH the Queue table (Status column) AND the separate Resolved table (evidence rows). NOTE: the Queue `#` column and the Resolved `#` column overlap numerically (Queue # = queue position 1-97; Resolved # = resolution sequence 1-65) — this is the tracker's existing structure, not a bug.
- **Merge queue re-verify is mandatory even on a clean rebase.** Every wave-11 rebase was clean yet each got full `bun test` + `bun run typecheck` in-worktree before merge. Suite grew 1818→1844 across the wave, then 1845 after LORE-190.
- **`lore` is NOT on the non-interactive shell PATH.** Invoke via `bun run src/cli.ts <cmd>`. `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **Worktree setup:** `$GIT worktree add --detach <path> "$WAVE_BASE"` then `$GIT -C <path> switch -c feature/<KEY>`. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — avoids the cross-device 0-byte bun-build trap). Each needs its own `bun install` (~1s warm; run all in parallel with `&`+`wait`). Pin `WAVE_BASE = dev HEAD after the dispatch-mark commit is committed+pushed`.
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only, between waves.** Minted LORE-190/191/192 that way via `backlog task create` (labels `codex-review-followup,<cluster>`, `--priority`, `--type bug`, `--ordinal`, single-quoted args for backtick text). Safe to mint while a worker runs IF the worker only `backlog task edit`s its OWN task (edits don't mint IDs). NEVER mint from a worktree.
- **The Fable review loop + integration review earn their keep.** Wave 11 impl was clean (0 fix rounds), but the integration review found a real medium (LORE-147's own new prose was factually wrong about check's `validation` cause, made worse by LORE-156 same wave) → LORE-190. And LORE-190's OWN first fix pass over-corrected into a NEW false claim ("two distinct causes" — falsely exhaustive) which the Fable re-review caught → 1 fix round. Budget the integration review + a fix round every wave.
- **LORE-192 fix note (for whoever takes it):** loadBundle's path space is bundle-relative (`index.md`), NOT repo-relative (`docs/index.md`) — a naive reuse of LORE-144's validate.ts `effectiveProfileFor` (which matches `docs/index.md`) would silently miss. Apply the reserved-root exemption at loadBundle's bundle-relative root path.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement/re-merge the 6 wave-11 issues or LORE-190 — all Done/merged (Resolved rows 59-65).
- Don't re-run `backlog task create` for LORE-96..192 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists). Use `js-yaml` named import `{ load }`.
- Don't put two tasks touching the same shared module in one wave (busiest list above). Same-cluster is also a sufficient conflict condition — serialize same-cluster items.
- Don't trust a task's file citations at face value — the description regex over-collects context-only paths (e.g. 153/191 cite check.ts as context but don't edit it; 144 cited schema.ts but fixed validate.ts). Pin the true edit target by locating the actual symbol (`grep -rn "function <name>" src/`) before building the conflict graph. This wave, decodeTarget was confirmed single-definition in links.ts so LORE-151 stayed disjoint from LORE-138's check.ts.
- Don't run `gh pr merge` from inside a worktree; don't forget the explicit remote-branch-delete sweep after merging.
- Don't use bare `git` in a for-loop — use `$GIT=/opt/homebrew/bin/git`.
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
- Don't treat the wave-11 "session stops" as an escalation — clean context checkpoint (R4j); nothing is blocked. LORE-191/192 are normal queued follow-ups.
