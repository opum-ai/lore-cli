# Handover — Codex review follow-up campaign, round 2 (waves: 2 done this session, issues: LCLI-96,98,102,107,110,114,97,99,103,108,111,115 + dups 127,131,173)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `e4dc26f`, clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`), 0 ahead / 0 behind `origin/dev`, single worktree, no `feature/*` branches, no open PRs | **Tracker**: doc-3

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). This session ran
2 full wave-parallel waves and STOPPED clean between waves (context budget), nothing
in flight. 15 tasks Done (see doc-3 Resolved rows 1-15): wave 1 = LCLI-96,98,102,107,
110,114 (PRs #92-#97); wave 2 = LCLI-97,99,103,108,111,115 (PRs #98-#103); plus 3
resolved-by-merge duplicates closed at settlement (LCLI-127,131 by LCLI-107; LCLI-173
by LCLI-115). 2 follow-ups filed: LCLI-174 (cmd-crud-a, from wave-1 integration review)
and LCLI-175 (cli-entry-state low, from wave-2 integration review). 65 tasks remain open.
Scope = medium-only, confirmed 2026-07-21/re-affirmed 2026-07-22; do NOT re-ask scope/order.
Zero formal deps across all tasks (YAML-verified) — readiness gated ONLY by the live
file-conflict graph. Recompute the ready set live at restore; do NOT hardcode a next-wave
list. Full wave-parallel mode is available (Opus + Workflow tool): create orchestrator-owned
worktrees under lore.worktrees/ @ current dev, dispatch parallel Sonnet workers, gate every
task on a mandatory Fable review, merge serially yourself. Start R4 fresh (compute graph).
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete — all 20 high-severity doc-2 findings resolved (prior session) |
| Round 2 this session | **Waves 1 + 2 complete: 12 tasks implemented+reviewed+merged, 3 duplicates closed = 15 Done** |
| Wave 1 | LCLI-96,98,102,107,110,114 — PRs #92–#97, all Fable-approved first pass, 0 escalations |
| Wave 2 | LCLI-97,99,103,108,111,115 — PRs #98–#103, all Fable-approved (LCLI-115 after 1 fix round), 0 escalations |
| Duplicates closed | LCLI-127,131 (resolved-by-merge by LCLI-107); LCLI-173 (by LCLI-115) — verified vs merged dev, marked Done w/ evidence, no re-fix |
| Follow-ups filed | LCLI-174 (cmd-crud-a: `lore new` default-slug reserved-stem gap); LCLI-175 (cli-entry-state, low: readConfigText denied error omits errno `code`) |
| Queue | **65 open** of 80 total (78 original medium + LCLI-174 + LCLI-175). Nothing in flight. |
| Formal deps | **None** across all tasks (YAML-verified). Readiness gated solely by live file-conflict graph. |
| Not queued | LCLI-42..45 (deferred v2 mcp / Confluence / importable-library) — out of scope |
| Git state | `dev` @ `e4dc26f`, pushed to `origin/dev`. Integrated suite **1718 pass / 0 fail**, typecheck clean, biome clean (4 pre-existing infos). No feature branches, worktrees, or PRs. |

## Next steps

1. `/clear` → `/backlog-handover restore`. Ground truth should be clean (nothing in flight). Enter the R4 wave loop directly: compute the DAG (trivial — no deps), compute the file-conflict graph from each ready task's cited file paths, build wave 3 (≤6 workers, conflict-disjoint, one per distinct cluster in queue order), mark Dispatched, set up worktrees @ current dev, dispatch Sonnet workers + Fable reviewers, merge serially, settle, loop.
2. **Wave-3 tie-break candidates (informational — recompute live, do NOT hardcode):** next task per distinct cluster in queue order is roughly LCLI-100 (build-ci-config), LCLI-104 (build-runtime), LCLI-109 (cli-entry-state), LCLI-112 (cmd-check), LCLI-116 (cmd-crud-a), LCLI-117 (cmd-crud-b). **But** LCLI-116 and LCLI-174 and LCLI-175 conflicts must be checked: LCLI-116/LCLI-174 are both cmd-crud-a; LCLI-175 is cli-entry-state and touches src/config.ts (conflicts with LCLI-108-area but LCLI-108 is done). Verify file citations per R4b before committing the wave.

## Critical context / traps

- **Same-cluster ⇒ treat as conflicting; different cluster ≠ safe.** The file-citation read (R4b) is load-bearing: this session it caught 3 real cross-cluster duplicates (LCLI-107↔127/131 in cli.ts/help.test.ts; LCLI-115↔173 in output.ts/renderTaskSummaryRows; LCLI-114↔174 in new.ts). **Budget the settlement step to re-check remaining flagged duplicates and close any that are resolved-by-merge** (mark Done w/ evidence, don't re-fix). No known unclosed duplicates remain after this session, but always re-scan when a shared-file task lands.
- **Worktree bash gotcha (this sandbox):** a single bash script that combines `cd` + `set -e` + `git worktree add` (writing to the sibling `lore.worktrees/` dir) + output redirection produced spurious `command not found: git` and silently failed. **Fix: drive worktree setup with plain sequential `git -C <path> ...` calls, no `cd`, no `set -e`, no `>/dev/null` on the worktree-add.** Verified working that way both waves.
- **Worktree placement:** `/Volumes/external/repos/lore.worktrees/<KEY>` (sibling of toplevel, SAME filesystem — no cross-device 0-byte-binary trap). Each worktree needs its own `bun install` (node_modules per-dir; warm cache ≈ 0.5s each; parallelize in background). `git worktree add --detach <path> <WAVE_BASE>` then `git -C <path> switch -c feature/<KEY>`.
- **Merge queue that worked:** per branch, one combined bash call with `set -o pipefail` and abort-on-failure: `git -C <wt> fetch origin` → `rebase origin/dev` → verify (`bun run typecheck` + `bun test`, both must pass; `bash -n` for shell-script tasks) → `push --force-with-lease` → `gh pr create` → `gh pr merge --rebase --delete-branch` → `git checkout dev && git pull --ff-only` → `git worktree remove` → `git branch -d`. Rebase-onto-moving-dev is the NORMAL case; re-verify every branch even on a clean rebase. `gh pr merge --delete-branch` prints a harmless "cannot delete local branch (used by worktree)" — grep it out; the worktree-remove + branch-d afterward handle local cleanup.
- **Backlog ID minting** (task create/promote/demote) stays sequential + orchestrator-only + primary-checkout-only. This session minted LCLI-174, LCLI-175 that way. Workers only `task edit` their own file (safe in parallel).
- **This queue IS a security/robustness review's follow-up backlog.** Hold a high Fable review bar; Fable independently re-runs each task's verification, never trusts the worker. Both integration reviews this session ran a full `bun test` + tsc + biome themselves.
- **doc-1 untouched** (round-1 record). doc-2 is the source review. The 91 low-severity findings remain out of scope (revisit via a fresh `init` over doc-2's low section only if round 2 fully completes).

## Do not repeat

- Don't re-run `backlog task create` for LCLI-96..175 — they exist; re-creating duplicates them.
- Don't re-fix LCLI-127, 131, 173 — already Done (resolved-by-merge, evidence in doc-3 Resolved rows 13–15).
- Don't create a doc-4 — the tracker is doc-3, updated in place each wave.
- Don't re-ask scope or queue order — confirmed and recorded in doc-3's "Scope / order confirmation".
- Don't grep `backlog/tasks/*.md` for dependencies — false negatives on multi-line YAML lists. Use a real YAML parse (done: zero deps everywhere).
- Don't combine `cd`+`set -e`+redirection with `git worktree add` in one script (phantom "command not found: git" — see traps).
