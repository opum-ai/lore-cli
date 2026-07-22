# Handover — Codex review follow-up campaign, round 2, wave-parallel re-init (waves: 0, issues: none yet)

**Date**: 2026-07-22 | **Grounded against**: `dev` @ `d6abe3b`, clean tree (only untracked `.repro-scratch/`, `docs/.obsidian/`), 0 ahead / 0 behind `origin/dev` | **Tracker**: doc-3

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3
("Backlog campaign tracker — Codex review follow-ups (round 2)"). 0 waves run this
session — this was a re-init only: doc-3 was migrated from the round-1 cursor format
to the wave-parallel skeleton (Frontier + Status/Wave columns + Wave log). Queue is
78 medium tasks LORE-96..173, all To Do; scope "medium only" confirmed by the user
2026-07-21 and re-affirmed 2026-07-22 — do not re-ask scope or order. Zero formal
deps across all 78 (YAML-verified), so readiness is gated ONLY by the live file-
conflict graph. The ready set is recomputed live at restore — do NOT hardcode a
"next wave" list. Full wave-parallel mode is available (Opus + Workflow tool):
dispatch parallel Sonnet workers into orchestrator-created worktrees, gate every
task on a mandatory Fable review, merge serially yourself. Nothing is in flight; no
leftover branches/worktrees/PRs to reconcile — start R4 (compute the graph) fresh.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LORE-69..95) | Complete — all 20 high-severity doc-2 findings resolved |
| Round 2 queue | 78 medium tasks LORE-96..173, all **To Do** — nothing worked yet |
| Tracker doc-3 | **Re-initialised to wave-parallel format** (this session): Frontier section, Queue table now has Formal deps / Status / Wave columns, Cursor section removed, Wave log added. Committed `4119dd5`, pushed. |
| Formal deps | **None** — all 78 task files YAML-parsed 2026-07-22, every `dependencies` list empty. Readiness gated solely by file-conflict graph. |
| Not queued | LORE-42..45 (deferred v2 mcp / Confluence / importable-library) — recorded in doc-3 "Not queued", out of scope |
| Git state | `dev` @ `d6abe3b`, pushed to `origin/dev`. Two commits this session: `4119dd5` (tracker re-init), `d6abe3b` (archive consumed handover). No feature branches, worktrees, or PRs. |

## Next steps

1. `/clear` → `/backlog-handover restore`. Restore will re-verify ground truth (should be clean — nothing in flight), then enter the R4 wave loop directly: compute the DAG (trivial — no deps), compute the file-conflict graph from each ready task's cited file paths, build wave 1 (≤6 workers, conflict-disjoint), mark Dispatched, set up worktrees, dispatch Sonnet workers + Fable reviewers, merge serially, settle the tracker, loop.
2. First-wave tie-break order (informational only): queue positions 1–6 are LORE-96, LORE-97 (both `adapter-backlog` → conflict, so only one of them per wave), LORE-98..101 (`build-ci-config`). The conflict graph will thin same-cluster items across waves — expect wave 1 to draw one item per distinct cluster, not the literal first 6 rows.

## Critical context / traps

- **Same-cluster ⇒ treat as conflicting.** The queue is cluster-grouped, so consecutive rows usually share a file. Different cluster is NOT proof of safety (documented counter-example in this project: two tasks in different clusters were the same bug in the same file). Do the file-citation read per R4b.
- **Backlog task-ID minting stays sequential + orchestrator-only + primary-checkout-only.** Never `backlog task create`/`promote`/`demote` from a worktree or in parallel — known ID-collision hazard. Workers only `task edit` their own already-existing task file (safe in parallel).
- **Cross-device worktree trap.** Place worktrees at a sibling of the real toplevel (`$(dirname TOPLEVEL)/$(basename TOPLEVEL).worktrees/<KEY>`), never under `$TMPDIR` or another filesystem — `bun build --compile` silently emits a 0-byte binary at exit 0 across a device boundary. Each worktree needs its own `bun install`.
- **This queue IS a security/robustness review's follow-up backlog.** Hold a high review bar — a sloppy fix that reintroduces a same-class bug is the worst outcome. Fable independently re-runs each task's verification, never trusts the worker's self-report.
- **doc-1 untouched** except its existing forward-pointer to doc-3; round-1 history stays independently readable.

## Do not repeat

- Don't re-run `backlog task create` for LORE-96..173 — they already exist; re-running drafting/creation would duplicate all 78.
- Don't create a doc-4 — the tracker is doc-3, reformatted in place (user chose "reformat in place" over "new doc" on 2026-07-22).
- Don't re-ask the user for scope or queue order — both are confirmed and recorded in doc-3's "Scope / order confirmation" section.
- Don't grep `backlog/tasks/*.md` for dependencies — false negatives on multi-line YAML lists (this project's established trap). Use a real YAML parse (already done this session: zero deps).
