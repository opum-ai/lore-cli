# Handover — Codex review follow-up campaign, round 3 (low-severity) — INIT complete, 0 waves run

**Date**: 2026-07-23 | **Grounded against**: `dev` @ `66e17a5` (local == origin; verify `git rev-list --left-right --count dev...origin/dev` → `0  0`). Clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`). **No worktrees, no feature branches (local or remote), no open PRs.** **Tracker**: doc-4.

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-4
("Backlog campaign tracker — Codex review follow-ups (round 3)"). Round 3 = doc-2's
LOW-severity findings. INIT is complete, 0 waves run yet: 55 agent-resolvable tasks are
queued (LORE-198..250 = 53 new from the re-audit, + LORE-195 lint chore + LORE-197 check.ts
bug folded in), all To Do, all ZERO formal deps. Queue order confirmed by user 2026-07-23
(full-round-3 re-audit + docs-first: docs→chore→task→enhancement→bug, cluster-mates adjacent);
do NOT re-ask, do NOT re-run the re-audit. The ready set is recomputed live at restore — do NOT
hardcode a next-wave list. Readiness is gated PURELY by the live file-conflict graph (25 clusters,
same-cluster items serialize; zero deps). Full wave-parallel mode (Opus + Workflow) proven across
rounds 1–2 (18 waves). USE /opt/homebrew/bin/git (absolute) inside any loop/subshell. Reusable
machinery in .repro-scratch/ from round 2: wave15-workflow.mjs (implement+review Workflow template),
wave*-dispatch-mark.mjs / wave*-settle.mjs (tracker line-splicers), wave16/17/18-* (latest). Bump the
WAVE number and set the tracker file to doc-4. KNOWN: dev lint baseline is pre-RED (biome, ~3 err +
4 info in untouched files) — gate merges on `bun test` + `bun run typecheck`, NOT `bun run lint`;
LORE-195 (in this queue) is the task that fixes it. NEVER build a tracker update from a piped
`backlog doc view` (truncates) — read the raw .md, splice line-based, verify wc -l + `^## ` headers.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete (prior sessions) — 20 high-severity findings |
| Round 2 (doc-3, LORE-96..194) | Complete — 78 medium findings + follow-ups, 18 waves, all merged |
| Round 2 follow-ups (this-day, earlier) | LORE-195 (lint chore) + LORE-197 (check.ts bug) → folded into round-3 queue; LORE-196 (docker-e2e required check, needs-human) → Not queued |
| **Round 3 (doc-4) — INIT complete** | **55 agent-resolvable tasks queued (LORE-198..250 + LORE-195 + LORE-197), all To Do, zero deps. 0 waves run. 0 resolved.** |
| Re-audit outcome (doc-2 low, 97 findings) | 53 open-agent + 25 resolved-by-merge + 12 dismissed + 7 needs-human (4 adversarial-verify corrections). 50-agent parallel re-audit, 2026-07-23. |
| Not queued | 7 needs-human findings + LORE-196 + deferred LORE-42/43/44/45 (see doc-4 "Not queued") |
| Git | `dev` @ `66e17a5` (== origin). No worktrees, no `feature/*`, no open PRs. Clean. |

## This session's in-flight wave

None — this session only ran `init` (re-audit → mint 53 tasks → build tracker doc-4). No waves dispatched, no mid-wave leftovers.

## Next steps

1. `/clear` → `/backlog-handover restore`. R2 finds a clean slate (no drift). Proceed to R4: compute the live ready/conflict graph over the 55 To-Do tasks and dispatch wave 1 (≤6 file-disjoint workers, distinct clusters).
2. **R4a/R4b — build the graph from the TASK BODIES**: each round-3 task's description carries its precise file:line citation(s) (from the re-audit). Read every non-terminal task file (YAML-parse frontmatter for `dependencies`/`ordinal`/`labels`; read the body for the cited files). All 55 have zero deps, so the conflict graph is the whole scheduler. Extract the real repo file(s) each touches; `conflicts(A,B) := same cluster OR file-sets intersect`.
3. **Reuse the round-2 machinery** (`.repro-scratch/wave15-workflow.mjs` etc.): bump the wave number, set the tracker file to `doc-4`, keep the Sonnet-implement → Fable-review pipeline + capped fix loop, the serial merge queue (create PR → `gh pr merge <PR#> --rebase --admin` WITHOUT `--delete-branch` → sync dev → remove worktree → delete local+remote branch), and the wave-level Fable integration review.
4. **Docs-first tie-break**: the queue ordinals run docs (LORE-198..203) → chore (204..210 + LORE-195) → task (211..216) → enhancement (217..221) → bug (222..250 + LORE-197). Earliest-ordinal ready + conflict-disjoint items get wave priority; not a strict slot order.

## Critical context / traps

- **Same 25 clusters as round 2** (adapter-backlog, build-ci-config, cmd-check, core-bundle-check, errors-output-git, …). Same-cluster items conflict (serialize). Cross-cluster is NOT automatically safe — always do the file-citation read (round 2 hit a real cross-cluster same-file collision).
- **All 55 tasks have ZERO formal deps** — readiness is purely the file-conflict graph. Re-verify live each restore (YAML-parse, never grep `backlog/tasks/*.md` for deps — false negatives on multi-line lists).
- **Lint baseline is pre-RED** (biome, untouched files) — gate merges on `bun test` + `bun run typecheck` only, NEVER `bun run lint`. LORE-195 (queued) fixes it; once it merges, a future wave could re-enable a lint gate.
- **Tracker-write discipline (doc-4)**: build every update by reading the RAW on-disk `.md` (NOT `backlog doc view`, which truncates), splice with LINE-BASED array ops (round-2 `wave*-dispatch-mark.mjs` / `wave*-settle.mjs` are templates), write body-only via `backlog doc update doc-4 --content "$ENVVAR"` (env var, not inline — body has backticks). After every write, verify on-disk `wc -l` + `grep -nE '^## '` headers.
- **Merge from the PRIMARY checkout, never a worktree** (post-merge cleanup fails on shared `dev`). Worktree placement `/Volumes/external/repos/lore.worktrees/<KEY>` (SAME filesystem — the cross-device 0-byte bun-build trap). Each worktree needs its own `bun install`. Forbid `git stash` in worker prompts (refs/stash is repo-wide across worktrees).
- **Backlog id-minting is sequential, orchestrator-only, primary-checkout-only, between waves.** `backlog task edit` on an existing different id per worker is parallel-safe.
- **Not-queued items** (do NOT dispatch): the 7 needs-human re-audit findings (build/CI product calls, a symlink-follow bundle walk, a rollback-verification design question, a resource_base URL-validation call, a golden-schema-independence call), LORE-196 (docker-e2e repo-admin), LORE-42/43/44/45 (deferred v2).
- **`lore` is NOT on PATH** → `bun run src/cli.ts <cmd>`. `lore check` clean = "38 files, 0 errors, 0 warnings".

## Do not repeat

- **Don't re-run the round-3 re-audit or re-mint LORE-198..250** — init is done; tasks exist and are committed (`66e17a5`).
- **Don't gate merges on `bun run lint`** — dev baseline is pre-RED; gate on `bun test` + typecheck.
- **Don't build a tracker update from a piped `backlog doc view`** — read the raw `.md`; verify `wc -l` + section headers after.
- **Don't pass tracker/PR-body content with backticks through the shell inline** (`"$(cat)"`); use an env var or `--body-file`, or a Write-tool text file read by a splice script.
- **ID-parse trap (bit init once):** when scripting `backlog task create` and parsing the created id, a title/description that MENTIONS "LORE-N" (e.g. "…import the canonical encoder from links.ts (LORE-28 landed)") is matched by a naive `/LORE-\d+/` on stdout — parse the `File:` path line's `lore-<N>` or the id right after `Task `, not the first LORE-match. (One id was misparsed as LORE-28, corrected to LORE-210.)
- **Don't co-schedule same-cluster tasks** or cross-cluster same-file tasks — file-citation read first.
- **Don't set docker-e2e branch protection autonomously** (LORE-196 is needs-human, repo-admin).
- **Don't create a doc-5** — the round-3 tracker is doc-4, updated in place. doc-1=round1, doc-2=source review, doc-3=round2.
