# Handover — Codex review follow-up campaign, round 2 (waves: 4 done total; this session ran wave 4: LCLI-176 + the held LCLI-100, both merged)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `befb34e` (local; 1 ahead of `origin/dev` @ `5095214` = the archive commit, pushed by R5). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-3.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 4 waves complete;
22 tasks Done (doc-3 Resolved rows 1-22), 0 held/in-flight, 60 medium tasks remain To Do.
This session (wave 4) executed the user's wire-the-gate decision: merged LCLI-176 (PR #109 @
0fd3a98, fixed the stale run-e2e.sh AC4 assertion; harness 299/0) then the previously-held
LCLI-100 (PR #110 @ 995a02b, docker-e2e CI gate now green-at-birth, 299/0). Nothing is held
anymore. Queue order confirmed by user 2026-07-21/re-affirmed 2026-07-22 (medium-only); do NOT
re-ask scope or order. Zero formal deps remain (LCLI-100→LCLI-176 dep is discharged). The ready
set is recomputed live at restore — do NOT hardcode a next-wave list. Next restore = a normal
wave over the 60 remaining mediums (start fresh: read every non-terminal task file, YAML-parse
frontmatter, build the live file-conflict graph). Full wave-parallel mode (Opus + Workflow)
available. TWO open low-severity items from wave 4's integration review (neither blocks work):
(1) LCLI-178 (To Do) — runbook docs/runbooks/docker-e2e-testing-environment.md doesn't mention
CI now runs the harness (docs-only via lore). (2) docker-e2e BRANCH PROTECTION is a repo-admin
setting a human must apply (or declare moot) — see doc-3 "Not queued"; narrow because --admin
merges bypass required checks anyway.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete (prior sessions) — all 20 high-severity doc-2 findings resolved |
| Round 2 waves 1-3 | Complete (prior sessions): 20 Done (incl. 3 resolved-by-merge dups), PRs #92-#108 |
| **Round 2 wave 4 (this session)** | **COMPLETE: LCLI-176 + the held LCLI-100 both merged. docker-e2e CI gate wired and proven green-at-birth (299/0).** |
| LCLI-176 | Done. PR #109 @ `0fd3a98`. Fable **approve**. Rewrote stale run-e2e.sh AC4 assertion as `step_fail … 6 '.error_type=="validation"' -- lore check --json` (LCLI-89 profile-aware contract). Orchestrator docker gate: **299 passed / 0 failed, exit 0** (was 298/1) |
| LCLI-100 | Done. PR #110 @ `995a02b`. Held from wave 3; unblocked by LCLI-176. Rebased clean (ci.yml byte-identical to wave-3 approval; 1 task-file metadata conflict → Done). Decisive docker gate on merged bytes: **299/0, exit 0**; actionlint clean |
| Wave-4 integration review (Fable) | **findings_present (2 low, 0 blocking/high/med).** All seams verified clean (exit-code-from service; report.jsonl path chain; PUID/PGID ARG chain; no other stale profile premise; hygiene). Findings → LCLI-178 filed + branch-protection to "Not queued" |
| Queue | **22 Done, 0 held/in-flight, 60 To Do** (58 original mediums + LCLI-177 + LCLI-178). 4 deferred (LCLI-42..45) + branch-protection in "Not queued" |
| Formal deps | **None remain.** The only dep (LCLI-100→LCLI-176) is discharged. Readiness is gated purely by the live file-conflict graph |
| Git | `dev` @ `befb34e` (origin after R5 push). No worktrees, no `feature/*` branches (local/remote), no open PRs. Fully clean between-wave state |

## This session's in-flight wave

None — wave 4 fully settled and merged. No mid-wave leftovers. (This section intentionally has no rows.)

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (no worktrees/branches/PRs) — nothing to reconcile. Proceed straight to R4: compute the live ready/conflict graph over the 60 To-Do mediums and dispatch a normal wave (≤6 workers).
2. **Do NOT re-do wave 4.** LCLI-176 + LCLI-100 are Done/merged (Resolved rows 21-22). The docker-e2e gate is live in ci.yml and green.
3. Normal-wave cluster-leaders to consider (informational only — recompute live): LCLI-101 (build-ci-config), LCLI-104/105/106 (build-runtime, docker/e2e — now that LCLI-176 landed they no longer conflict with a held LCLI-100), LCLI-113 (cmd-check), LCLI-117/118/119/120 (cmd-crud-b), LCLI-121 (cmd-link — conflicts w/ LCLI-177), LCLI-123/124/125 (cmd-meta-a), LCLI-174 (cmd-crud-a). Many mediums remain; a wave naturally caps at 6 file-disjoint items.
4. **User action item (optional, non-blocking):** decide docker-e2e branch protection — enable it as a required check in repo settings, or record it as moot (see doc-3 "Not queued"). An agent should not change this autonomously.

## Critical context / traps

- **docker/e2e harness runs GREEN locally on macOS** via `docker compose -f docker/e2e/docker-compose.yml up --build --exit-code-from e2e` → look for `==== E2E summary: 299 passed, 0 failed ====` + `COMPOSE_EXIT=0`. The `e2e-e2e` image + buildx cache are warm; `run-e2e.sh` is COPYed near the END of the Dockerfile, so editing it only rebuilds tail layers (fast). PUID/PGID default to 1000 and macOS VirtioFS maps it — passing real ids is a ubuntu-runner-only concern, NOT needed locally. Only ONE compose run at a time (project name `e2e` → shared image/container); serialize docker runs.
- **`gh pr merge --delete-branch` does NOT delete the remote branch in this repo.** After each merge, explicitly `git push origin --delete feature/LORE-<K>`. R2 should treat leftover *merged* remote branches as stragglers to delete (verify via `git cherry origin/dev <branch>` all `-` + `gh pr list` MERGED), NOT as work in flight.
- **The R4b file-citation read is load-bearing.** Wave 4 confirmed LCLI-176 (run-e2e.sh) and LCLI-100 (ci.yml) were file-disjoint despite both being "docker-e2e" — always resolve bare filenames to real paths and over-approximate conflicts.
- **Held-branch merges resume at the MERGE stage, not re-implement.** Wave 4's LCLI-100 was already Fable-approved; only its merge-blocker (a red gate) needed clearing. A rebased branch whose code diff is byte-identical to the approved diff carries its prior approval — only re-verify + the wave-level integration review are needed.
- **Worktree setup:** plain sequential `git worktree add --detach <path> <BASE>` then `git -C <path> switch -c feature/<KEY>`; NO `cd`+`set -e`+redirection in one script (phantom `command not found: git`). Placement `/Volumes/external/repos/lore.worktrees/<KEY>` (same filesystem — avoids the cross-device 0-byte trap). Each worktree needs its own `bun install` for TS tasks (docker-only tasks don't).
- **Tracker doc updates replace the WHOLE body.** `backlog doc update doc-3 --content "$(cat body)"` — extract the body (strip frontmatter; CLI re-manages it), edit surgically in scratchpad, feed back. `auto_commit: false` — commit backlog/ writes explicitly (quote the em-dash/space pathspecs).
- **Backlog ID minting stays sequential, orchestrator-only, primary-checkout-only.** Minted LCLI-178 that way this session.
- **doc-1** = round-1 record. **doc-2** = source Codex review. The 91 low-severity findings remain out of scope (fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-implement or re-merge LCLI-176 / LCLI-100 — both Done/merged (Resolved rows 21-22).
- Don't re-run `backlog task create` for LCLI-96..178 — they exist.
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order (medium-only, confirmed/recorded in doc-3).
- Don't grep `backlog/tasks/*.md` for dependencies — YAML-parse (false negatives on multi-line lists).
- Don't run two docker compose harness runs at once — they collide on the shared `e2e-e2e` image/container; serialize.
- Don't set docker-e2e branch protection autonomously — it's a repo-admin, outward-facing setting for the user to decide.
- Don't treat the wave-4 "session stops" as an escalation — it was a clean context checkpoint (R4j); nothing is blocked.
