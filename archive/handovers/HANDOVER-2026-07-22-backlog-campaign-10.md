# Handover — Codex review follow-up campaign, round 2 (this session ran wave 12: 6 issues merged, 2 follow-ups filed; repaired a tracker truncation)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `01414d7` (local == `origin/dev`; verified via `git rev-list --left-right --count`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote — `ls-remote` clean, stale tracking refs pruned), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 12 waves complete;
71 campaign tasks Done (doc-3 Resolved rows 1-71), 0 held/in-flight, 28 in-scope tasks
remain To Do (+4 deferred LCLI-42..45 in "Not queued"). This session drained wave 12
(LCLI-140,152,157,159,162,164 — PRs #154-#159, all Fable-approve on first pass, 0 fix,
0 escalations). Filed 2 follow-ups still To Do: LCLI-193 (core-bundle-check, MEDIUM —
parseItems accepts items={enum=[]}, LCLI-140 sibling one seam over, one-call fix reusing
assertNonEmptyEnum in parseItems) + LCLI-194 (core-replace, low — document/pin the
throw-on-duplicate locator contract behind assertNoInjectedMarker). Queue order confirmed
by user 2026-07-21/re-affirmed 2026-07-22 (medium-only); do NOT re-ask scope or order.
Zero formal deps among all 28 in-scope To-Do (re-verify live via YAML parse; only
LCLI-42..45 carry deps, to already-Done non-campaign tasks). The ready set is recomputed
live at restore — do NOT hardcode a next-wave list. Full wave-parallel mode (Opus +
Workflow) available and proven. USE /opt/homebrew/bin/git (absolute path) inside any
for-loop/subshell — bare `git` intermittently hits "command not found" non-interactively.
FIRST verify LCLI-165 (rewrite.ts regression test) is not already resolved-by-merge by
LCLI-164 — see Critical context. NEVER build a tracker update from a piped `backlog doc
view` (it truncated this doc mid-campaign) — see the truncation trap below.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-11 | Complete (prior sessions): 65 Done incl. docker-e2e CI gate + 3 resolved-by-merge dups |
| **Round 2 wave 12 (this session)** | **COMPLETE: LCLI-140,152,157,159,162,164 merged (PRs #154-#159). 6/6 Fable approve, 0 fix, 0 escalations. Base `6e55e67` → dev `bd27700`. Integration review FINDINGS_PRESENT (1 low + 5 info, non-blocking); suite 1846→1859/0, typecheck clean, `lore check` 38/0/0.** |
| Follow-ups filed this session | LCLI-193 (core-bundle-check, **medium** — parseItems empty-enum sibling of LCLI-140) **To Do**; LCLI-194 (core-replace, low — locator-contract doc for assertNoInjectedMarker) **To Do** |
| Queue | **71 Done, 0 held/in-flight, 28 in-scope To Do** (+4 deferred LCLI-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `01414d7` (== origin, after settlement + handover-archive commits). No worktrees, no `feature/*` branches (local or remote), no open PRs. Clean between-wave state. |

## This session's in-flight wave

None — wave 12 fully settled and merged; 2 follow-ups filed. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 28 in-scope To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do wave 12.** All 6 are Done/merged (Resolved rows 66-71). Don't re-mint LCLI-96..194 — they exist.
3. **FIRST: verify LCLI-165 (core-rewrite-engine, "Add regression test for rewriteInbound's move + excluded-source-id combination").** LCLI-164 this wave ALREADY added exactly that regression test (test/rename.test.ts:355, "move=true with the move source itself excluded reports no rename"). LCLI-165 is very likely **resolved-by-merge by LCLI-164** — check the merged test against LCLI-165's AC and, if satisfied, mark Done with an evidence note (like LCLI-127/131/173 were), rather than dispatching it.
4. **Cluster leaders to consider (informational only — recompute live; wave-12 freed links.ts/validate.ts/replace.ts/profile.ts/rewrite.ts/template.ts):**
   - core-query-validate LCLI-160 / 161 (both `src/core/validate.ts` — serialize, pick ONE)
   - core-rewrite-engine LCLI-165 (see step 3) / 180 / 184 (all touch `src/core/rewrite.ts` — serialize; 184 also bundle.ts+supersede.ts)
   - core-replace LCLI-163 (`src/core/replace.ts`) / **194** (`src/core/replace.ts`) — serialize (both replace.ts)
   - core-links-resolution LCLI-153 (`src/core/links.ts`; CITES check.ts as context — verify it doesn't EDIT check.ts before pairing with a check task)
   - core-scaffold-consumer LCLI-166 (`src/core/consumer-scaffold.ts`) / 167 / 168 (167+168 both `src/core/schema.ts` — serialize)
   - errors-output-git LCLI-169 / 170 (both `src/adapters/git.ts` — serialize) + 188 (git.ts) ; 171 / 172 (both `src/errors.ts` — serialize)
   - core-bundle-check LCLI-184 (bundle.ts+rewrite.ts+supersede.ts) / 185 (profile.ts+new.ts) / 192 (bundle.ts) / **193** (profile.ts) — serialize; note 185 & 193 both touch profile.ts
   - core-index-context LCLI-186 (`src/core/indexes.ts` + managed-block.ts)
   - cmd-link LCLI-179 / 183 (both `src/commands/link.ts` — serialize) ; cmd-crud-b LCLI-181 (query.ts+output.ts) / 189 (sync.ts) ; cmd-meta-a LCLI-182 (commands/schema.ts) ; cmd-meta-c LCLI-187 (commands/schema.ts+fswrite.ts) ; cmd-check LCLI-191 (commands/check.ts) ; build-ci-config LCLI-178 (docs-only runbook via lore)
   - **A clean example next wave (verify live):** 153 (links.ts), 160 (validate.ts), 163 (replace.ts), 166 (consumer-scaffold.ts), 169 (git.ts), 171 (errors.ts) — six disjoint clusters/files. Keep 163 & 194 apart (both replace.ts); keep 185 & 193 apart (both profile.ts).
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **NEW — tracker-write truncation trap (cost a full recovery this session):** `backlog doc view doc-3 --plain | tail -n +8` **truncated** the ~89KB doc on the read side (stopped ~line 340). The wave-12 dispatch-mark then wrote that truncated body back via `backlog doc update`, silently clobbering the wave-8..11 wave-log tail (361→340 lines, commit `6e55e67`). **Recovered at settlement** by rebuilding the body from `git show 6d8a076:"<tracker>"` (git reproduces the full file reliably) and re-applying edits. **Rule for all tracker updates:** build the new body from a git-extracted full file OR a size-verified capture — NEVER a piped `backlog doc view` that may truncate. **After every `backlog doc update`, verify the on-disk raw file line count** (`wc -l "backlog/docs/doc-3 - ...md"`) is >= expected. The tracker filename has an em-dash — `git add backlog/` catches it.
- **NEW — `$`\`/`$'`/`$&` are special in String.replace's REPLACEMENT string.** The settle/dispatch-mark scripts do string-splice edits; if any inserted text contains `` $` `` or `$'` (e.g. describing LCLI-162's regex tokens), a plain `body.replace(old, newStr)` splices in the whole surrounding document (~30K dup). **Always use a function replacer: `body.replace(old, () => newStr)`** so the insertion is literal. `scratchpad/settle12.mjs` + `scratchpad/dispatch-mark.mjs` are this session's working templates (settle12 has the fix; dispatch-mark did NOT hit it but should adopt the same pattern).
- **NEW — `git stash` is repo-wide across worktrees (now in auto-memory).** `refs/stash` is a single shared ref; two workers stashing for mutation-checks swapped diffs this wave (LCLI-140↔159). Both self-recovered; orchestrator verified stash empty + per-branch diffs before merge. **Forbid `git stash` in worker prompts;** use `git diff > patch` + `git apply -R`/`apply` or a file-copy revert. Worker dispatch prompts in `scratchpad/wave12.mjs` should be updated to say this.
- **`git` intermittently "command not found" inside a for-loop / subshell** non-interactively. Fix: `GIT=/opt/homebrew/bin/git` and call `$GIT` everywhere in loops. Proven reliable again this session.
- **Reusable merge-queue script:** `scratchpad/merge-one.sh <KEY> "<title>" "<body>"` — rebase onto origin/dev → mandatory re-verify (typecheck + `bun test`) in the worktree → `push --force-with-lease` → `gh pr create` + `gh pr merge --admin --rebase --delete-branch` (from PRIMARY) → sync dev → explicit `git push origin --delete` → `worktree remove` → `branch -D`. All 6 merges used it; every rebase clean (file-disjoint) yet each got full re-verify. **The "error: failed to push some refs" on the explicit remote-delete step is EXPECTED and harmless** — `gh --delete-branch` already removed the remote branch; the leftover `origin/feature/*` shown by `git branch -r` are STALE tracking refs, cleared by `git fetch --prune` (do this at R2). Do NOT pass a PR body containing `` ` `` unescaped through the shell.
- **Reusable wave workflow:** `scratchpad/wave12.mjs` — `pipeline(TASKS, implement(sonnet, agentType:'claude'), reviewLoopWithCappedFix(fable))` returning structured verdicts; orchestrator then runs the serial merge queue in Bash + a single `agent(model:'fable', subagent_type:'claude')` wave-integration review dispatched via the Agent tool (model:'fable', subagent_type:'claude'). Copy, swap meta.name / TASKS / pinned edit-targets, re-verify file citations live. Parse the workflow `.output` JSON directly (it's the returned array).
- **Merge queue re-verify is mandatory even on a clean rebase.** Every wave-12 rebase was clean yet each got full `bun test` + `bun run typecheck` in-worktree before merge. Suite grew 1846→1859 across the wave.
- **`lore` is NOT on the non-interactive shell PATH.** Invoke via `bun run src/cli.ts <cmd>`. `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **Worktree setup:** `$GIT worktree add --detach <path> "$WAVE_BASE"` then `$GIT -C <path> switch -c feature/<KEY>`. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — avoids the cross-device 0-byte bun-build trap). Each needs its own `bun install` (~1s warm; parallel with `&`+`wait`). Pin `WAVE_BASE = dev HEAD after the dispatch-mark commit is committed+pushed`.
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only, between waves.** Minted LCLI-193/194 that way via `backlog task create` (labels `codex-review-followup,<cluster>`, `--priority`, `--type bug`, `--ordinal 203000/204000`, `--ac` repeated; single-quote args to protect backticks). NEVER mint from a worktree.
- **The Fable review loop + integration review earn their keep.** Wave 12 impl was clean (0 fix rounds), but the LCLI-140 per-task review found a real medium sibling (parseItems, → LCLI-193) and the integration review confirmed it + found a low locator-contract gap (→ LCLI-194). Budget an integration review + possible follow-up filings every wave.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't build a tracker update from a piped `backlog doc view` — it truncated the doc this session. Use `git show <commit>:"<tracker>"` for the full body; verify on-disk `wc -l` after writing.
- Don't use a plain string as String.replace's 2nd arg when it may contain `` $` ``/`$'`/`$&` — use `() => newStr`.
- Don't use `git stash` in worker/reviewer worktrees (shared refs/stash) — use patch+apply.
- Don't re-implement/re-merge the 6 wave-12 issues or re-`backlog task create` LCLI-96..194 — all exist.
- Don't dispatch LCLI-165 before checking it's not resolved-by-merge by LCLI-164's added test.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists). Use `js-yaml` named import `{ load }`.
- Don't put two tasks touching the same shared module in one wave (163+194 both replace.ts; 185+193 both profile.ts; 160+161 both validate.ts; 169+170 both git.ts; 171+172 both errors.ts; 179+183 both link.ts; 167+168 both schema.ts). Same-cluster is also a sufficient conflict — serialize.
- Don't trust a task's file citations at face value — pin the true edit symbol first (`grep -rn "function <name>" src/`). This wave that caught LCLI-162 = `src/core/replace.ts` (NOT commands/replace.ts) and LCLI-164's rewriteInbound defined in rewrite.ts.
- Don't run `gh pr merge` from inside a worktree; run it from PRIMARY. The remote-delete "failed to push some refs" is harmless; `git fetch --prune` clears stale tracking refs.
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
