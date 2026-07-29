# Handover — Codex review follow-up campaign, round 2 (LCLI-96)

**Date**: 2026-07-21 | **Grounded against**: `dev` @ `d2548db` (round-2 setup commit, pushed), clean tree, 0 ahead/0 behind `origin/dev` | **Tracker**: doc-3

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-3 ("Backlog
campaign tracker — Codex review follow-ups (round 2)"). Cursor: LCLI-96 — "Validate/escape
argv values passed to backlog CLI to prevent flag injection" (src/adapters/backlog.ts).
Queue is 78 items (LCLI-96..173), confirmed scope "medium severity only" by the user on
2026-07-21; queue order is cluster-grouped (alphabetical by review cluster), an
implementation default, not a user-specified order — feel free to reorder if warranted.
This is round 2 of the same campaign mechanism as round 1 (doc-1, LCLI-69..95, which closed
all 20 high-severity findings). Same skill, same lifecycle, same self-merge default.

Round-2 setup (78 tasks + doc-1/doc-3 updates) is already committed and pushed
(`d2548db`) — just proceed straight into LCLI-96's normal per-issue lifecycle from step 0.
```

## State

| Item | Status |
|---|---|
| Round 1 (doc-1, LCLI-69..95) | Complete — all 8 items merged, all 20 doc-2 high-severity findings resolved |
| Round 2 source | Full re-audit of doc-2's 201 confirmed findings against live source (2026-07-21): 32 resolved (20 high + 6 medium + 6 low incidental), 169 still open (78 medium, 91 low) |
| Round 2 scope | User chose "medium only" (91 low findings deliberately left untracked for now) |
| Tasks created | LCLI-96..173 (78 tasks), type `bug`, priority `Medium`, labels `codex-review-followup,<cluster>`, `--ref` pointing at doc-2 |
| Tracker | doc-3, Cursor = LCLI-96, Queue table has all 78 rows in creation order |
| doc-1 | Updated with a forward-pointer note to doc-3 (round 1 history otherwise untouched) |
| Git state | Round-2 setup (78 tasks + doc-1/doc-3 updates) committed as `d2548db` and pushed to `origin/dev` |

## Next steps

1. Run the standard per-issue lifecycle on LCLI-96 (`backlog task view LCLI-96 --plain` for full description/AC, branch `feature/LCLI-96`, implement, review, PR, self-merge, prune, advance cursor to LCLI-97, archive this handover, write the next one).
2. Longer-term: once round 2's 78-item queue empties, the 91 still-open low-severity doc-2 findings are a candidate for a round 3 — not queued yet, would need the same draft-then-create treatment (see "Critical context" below for how round 2's tasks were built, reusable for round 3).

## Critical context / traps

- **Why the setup commit is separate from LCLI-96's own branch**: creating 78 tasks + a tracker doc is campaign infrastructure, not LCLI-96's own fix — matches how round 1's tracker/queue was committed directly on `dev` during init, before any feature branch existed.
- **Task IDs are sequential and unbroken except one archived stray**: LCLI-96 was almost consumed by a throwaway CLI-format test task (immediately archived, see `backlog/archive/tasks/lore-96 - test-dry-check.md`) — the REAL LCLI-96 (the argv-injection finding) is a separate, later `backlog task create` call that reused... actually no: Backlog.md does not reuse archived IDs, so double-check `backlog task view LCLI-96 --plain` shows the argv-injection task, not the stray — confirmed already in this session, just noting it so a future session isn't confused by the archived file sitting alongside.
- **Ordering is a default, not a user mandate**: the 78-item queue order is cluster-grouped (matches doc-2's own structure) purely for continuity/context-locality (same file/module fixes stay adjacent) — the user confirmed *scope* (medium-only) via a menu choice, not this specific sequence. A future session (or the user) can freely resequence the Queue table in doc-3 via `backlog doc update` if a different priority order makes more sense once work starts (e.g. security-tagged findings first).
- **Round 3 candidate exists but isn't built**: the 91 still-open low-severity findings from the same re-audit were intentionally NOT turned into tasks this round. If asked to start a round 3, the reusable approach is: re-run (or adapt) the two workflows used this round — one to draft title/description/AC per finding (grouped by cluster, one agent per cluster), then sequential `backlog task create` calls (never parallel — Backlog.md task-ID allocation is not safe under concurrent creates, per this project's own `[[Backlog.md fork checkout]]` memory and ADR-0012's "serializes creates" design).
- **doc-1 is intentionally left as-is otherwise**: only its Cursor section gained a forward-pointer paragraph; its Resolved table, Queue-empty state, and Session log from round 1 were not touched, so round 1's history stays intact and independently readable.

## Do not repeat

- Don't re-run `backlog task create` for any of LCLI-96..173 again — they already exist; re-running the drafting/creation workflow would produce 78 duplicate tasks. If you need to see what was drafted, the source JSON lives in this session's now-gone scratchpad (`/private/tmp/.../scratchpad/created-tasks.json`) — it will not survive into a new session, so just read the real tasks via `backlog task list --plain` / `backlog task view` instead of looking for that scratch file.
- Don't create backlog tasks via parallel/concurrent agents or shell calls — round 2's 78 tasks were deliberately created one at a time, sequentially, specifically to avoid a known Backlog.md task-ID collision hazard under concurrent `task create` calls.
