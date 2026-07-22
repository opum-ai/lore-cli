# Handover — Codex review follow-up campaign, round 2 (this session ran waves 8 & 9: 12 issues merged)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `19968a8` (local == `origin/dev`, verified). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 9 waves complete;
52 campaign tasks Done (doc-3 Resolved rows 1-52), 0 held/in-flight, 40 in-scope tasks
remain To Do (+4 deferred LORE-42..45 in "Not queued"). This session drained wave 8
(LORE-120,129,134,135,139,141 — PRs #129-#134) and wave 9 (LORE-130,136,142,145,148,154
— PRs #135-#140). All 12 Fable-approved (2 needed one fix round; 0 escalations). Filed 4
follow-ups from integration reviews: LORE-184 [med] / 185 [low] (wave 8), LORE-186 [med] /
187 [low] (wave 9). Queue order confirmed by user 2026-07-21/re-affirmed 2026-07-22
(medium-only); do NOT re-ask scope or order. Zero formal deps among all 40 in-scope To-Do
(re-verify live via YAML parse; only LORE-42..45 carry deps, to non-campaign tasks). The
ready set is recomputed live at restore — do NOT hardcode a next-wave list. Full
wave-parallel mode (Opus + Workflow) available and proven this session.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — all 20 high-severity findings resolved |
| Round 2 waves 1-7 | Complete (prior sessions): 40 Done incl. docker-e2e CI gate + 3 resolved-by-merge dups |
| **Round 2 wave 8 (this session)** | **COMPLETE: LORE-120,129,134,135,139,141 merged (PRs #129-#134). 6/6 Fable approve, 0 fix, 0 escalations. Integration review filed [[LORE-184]] (med) + [[LORE-185]] (low). Base `08846c0` → dev `e34d9c2`.** |
| **Round 2 wave 9 (this session)** | **COMPLETE: LORE-130,136,142,145,148,154 merged (PRs #135-#140). 6/6 Fable approve (136+145 each 1 fix round), 0 escalations. Integration review filed [[LORE-186]] (med) + [[LORE-187]] (low). Base `cde75d1` → dev `a1fd570` — settlement `61cc120`, archive `19968a8`.** |
| Follow-ups filed this session | LORE-184 (resolveRef shadowing, med), LORE-185 (template-guard dup, low), LORE-186 (linkText backslash escaping, med), LORE-187 (stale O_NOFOLLOW comments, low) — all in Queue as To Do |
| Queue | **52 Done, 0 held/in-flight, 40 in-scope To Do** (+4 deferred LORE-42..45 in "Not queued"). |
| Formal deps | **None** among campaign tasks (live YAML re-verify each restore). Readiness gated purely by the file-conflict graph. |
| Git | `dev` @ `19968a8` (== origin). No worktrees, no `feature/*` branches, no open PRs. Clean between-wave state. Suite 1809 pass / 0 fail, typecheck clean, `lore check` 38/0/0. |

## This session's in-flight wave

None — waves 8 and 9 fully settled and merged. No mid-wave leftovers. (Intentionally no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate — nothing to reconcile. Proceed to R4: compute the live ready/conflict graph over the 40 in-scope To-Do and dispatch a normal wave (≤6 file-disjoint workers).
2. **Do NOT re-do waves 8/9.** All 12 are Done/merged (Resolved rows 35-52). Don't re-mint LORE-96..187 — they exist.
3. **Cluster leaders to consider (informational only — recompute live):** core-bundle-check LORE-137/138/140 (check.ts/profile.ts — serialize, pick ONE); core-engine-a LORE-143/144; core-engine-b LORE-146/147; core-index-context LORE-149/150 + **LORE-186** (indexes.ts); core-links-resolution LORE-151/152/153 (all check.ts+links.ts — serialize); core-managed-template LORE-155/156/157; core-query-validate LORE-158/159/160/161; core-replace LORE-162/163; core-rewrite-engine LORE-164/165 + **LORE-180** + **LORE-184** (all conflict on rewrite.ts/bundle.ts — pick ONE); core-scaffold-consumer LORE-166/167/168; errors-output-git LORE-169/170/171/172; follow-ups LORE-178 (docs-only via lore), 179, 181, 182, 183, 185, 187.
4. **Conflict hints for the new follow-ups (respect in R4b):** LORE-184 ↔ bundle.ts/rewrite.ts/supersede.ts (conflicts LORE-164/165/180 + any bundle task); LORE-185 ↔ profile.ts/new.ts (LORE-140); LORE-186 ↔ indexes.ts/managed-block.ts (LORE-149/150/162 + 155/156/157); LORE-187 ↔ schema.ts/fswrite.ts (LORE-144/167/168/182). **check.ts and bundle.ts are the busiest shared modules** — LORE-137/138/151/152/153/168/180 all touch check.ts; put at most ONE per wave.
5. **User action item (optional, still open, non-blocking):** docker-e2e branch protection — enable as a required check in repo settings or record as moot (doc-3 "Not queued"). Agent must not change autonomously.

## Critical context / traps

- **Tracker doc updates REPLACE THE WHOLE body.** `backlog doc update doc-3 --content "$(cat body)"` — extract body via `backlog doc view doc-3 --plain | tail -n +8` (strips the 7-line frontmatter; CLI re-manages it), edit surgically in scratchpad, feed back. `auto_commit: false` — commit backlog/ writes explicitly; the tracker filename has an em-dash — `git add backlog/` catches it. The Queue table keeps Done rows in place (Status column) AND a separate Resolved table holds per-task evidence — maintain BOTH at settlement.
- **`gh pr merge` MUST be run from the primary checkout, NOT a worktree** (else `gh`'s post-merge local cleanup fails with `fatal: 'dev' is already used by worktree`). The MERGE still succeeds on GitHub — verify via `gh pr view <N>`.
- **`--delete-branch` does NOT reliably delete the remote branch here.** Both waves this session: after `gh pr merge --admin --rebase --delete-branch`, all 6 remote `feature/*` branches survived and needed an explicit `git push origin --delete feature/LORE-<K>` sweep at wave end. Always run the explicit remote-delete sweep after merging. Local branch delete order: sync dev → `git worktree remove` → `git branch -d` (the `--delete-branch` local step fails while the worktree holds the branch — expected).
- **Merge queue re-verify is mandatory even on a clean rebase.** Every rebase this session was clean (file-disjoint) yet each got full `bun test` + `bun run typecheck` in its worktree before merge. Suite grew 1771→1794 (wave 8) →1809 (wave 9).
- **`lore` is NOT on the non-interactive shell PATH.** Invoke via `bun run src/cli.ts <cmd>`. `lore check` = "38 files, 0 errors, 0 warnings" when clean.
- **Worktree setup:** plain sequential `git worktree add --detach <path> <BASE>` then `git -C <path> switch -c feature/<KEY>`; NO `cd`+`set -e`+redirection in one script. Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem as the symlink-resolved repo — avoids the cross-device 0-byte bun-build trap). Each worktree needs its own `bun install` (~1s warm cache).
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only.** Minted LORE-184/185/186/187 that way, between waves. NEVER from a worktree. Workers only `backlog task edit` their OWN task.
- **The Fable review loop earns its keep — expect premise corrections.** Wave 9 had TWO tasks whose original premise was WRONG and got corrected via a fix round: LORE-136 (GitHub excludes image alt text from slugs → lore already matched; net = docstring + tests) and LORE-145 (DOT REQUIRES backslash-doubling; removing it was a worse bug → only the newline escape was the real fix). Both verified against real external tools. When a fix-round commit message looks like a reversal of the impl summary, inspect the final merged diff before trusting either — the review usually got it right, but confirm.
- **Integration review reliably finds cross-task drift the per-task review can't.** Wave 8 → LORE-184 (a merged fix's precedence flip shadowing lore's own ref form via untouched writers). Wave 9 → LORE-186 (a sibling escaper `linkText` in an untouched file lacking the hardening a wave task added to `cell()`). Budget it every wave; file its findings as new tasks (sequentially) rather than blocking.
- **Workflow orchestration that worked:** `wave8.mjs` / `wave9.mjs` in scratchpad — `pipeline(TASKS, implement(sonnet), reviewLoop(fable review + capped 2-retry sonnet-fix loop))` returning structured verdicts; orchestrator then runs the serial merge queue in Bash + a single `agent(model:'fable', subagent_type:'general-purpose')` wave-integration review. Reusable template: copy, swap meta.name/WAVE_BASE/TASKS, re-verify file citations. Read only the workflow output's `.result` array (via a small bun parse script) to save context; the truncated inline result is fine to ignore.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement/re-merge the 12 waves-8/9 issues — all Done/merged (Resolved rows 35-52).
- Don't re-run `backlog task create` for LORE-96..187 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists). Use `js-yaml` **named import** `{ load }` — the bun-cached js-yaml is 5.x (no default export); v4 in repo node_modules also honors the named import.
- Don't put two tasks touching the same shared module in one wave. Busiest: `src/core/check.ts`, `src/core/bundle.ts`, `src/commands/check.ts`, `src/core/rewrite.ts`, `src/commands/fswrite.ts`, `src/core/schema.ts`, `src/core/indexes.ts`, `src/commands/link.ts`.
- Don't run `gh pr merge` from inside a worktree; don't forget the explicit remote-branch-delete sweep after merging (--delete-branch doesn't do it here).
- Don't set docker-e2e branch protection autonomously — repo-admin, user's call.
- Don't treat the wave-9 "session stops" as an escalation — clean context checkpoint (R4j); nothing is blocked. LORE-184/185/186/187 are normal queued follow-ups.
