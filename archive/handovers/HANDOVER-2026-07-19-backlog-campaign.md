# Handover — Backlog campaign session 1: LORE-67 (cli-surface.md stale claims)

**Date**: 2026-07-19 | **Grounded against**: `dev @ 6d7a38e`, clean (only pre-existing untracked `docs/.obsidian/`), in sync with `origin/dev` | **Tracker**: doc-1 (`backlog doc view doc-1 --plain`)

## Paste-ready prompt for the next session

```
Run /backlog-handover restore in /Volumes/external/repos/lore. Tracker: doc-1
(`backlog doc view doc-1 --plain`). Cursor: LORE-67 — cli-surface.md documents
behavior that does not exist (init --force/probe/exit-5, new type shorthands,
check --fix, replace exit-6 gate) plus two dead validate config knobs
(src/core/config.ts:65-70). Queue order (67, 61, 62, 63, 64, 65, 66) confirmed
by the user on 2026-07-19; do not re-ask. Merge gate: self-merge
(gh pr merge --rebase --delete-branch into dev) confirmed by the user on
2026-07-19 — the PR is an audit trail, not an approval gate.

LORE-67 is docs-only: re-verify EVERY stale claim against current source before
editing (any could have been implemented since filing), drive docs/ edits per
the repo's lore conventions (run `lore instructions` first; use the lore CLI,
not a bare editor, where it applies), and follow backlog instructions
task-execution → task-finalization for the task lifecycle. AC5 leaves the two
dead validate knobs as an implementation choice (wire up or un-document —
doc-side expected); document whichever you pick.
```

## State

| Item | Status |
| --- | --- |
| Campaign | Initialized this session. Tracker doc-1 committed on dev @ `6d7a38e`, pushed. |
| Queue | LORE-67 → 61 → 62 → 63 → 64 → 65 → 66 (user-confirmed 2026-07-19). All To Do, none started. |
| LORE-42/43/44/45 | Parked in tracker "Not queued" — deferred by recorded product decisions. Do not pick up. |
| Branches / PRs | No `feature/*` branches local or remote; no open PRs. |
| CHANGELOG convention | Doc-accuracy fixes get an `[Unreleased] → Fixed` entry (LORE-60 precedent); newest entry leads the subsection. |

## Next steps

1. Per-issue lifecycle on LORE-67 (`backlog task view LORE-67 --plain` for the five ACs): branch `feature/LORE-67` off dev, plan on the task, verify each stale claim against `src/commands/init.ts`, `src/commands/new.ts`, `src/commands/check.ts`, `src/commands/replace.ts`, `src/core/config.ts:65-70`, then correct `docs/reference/cli-surface.md`.
2. Review the branch diff adversarially, push, open PR into dev, self-merge (rebase), prune.
3. Advance the tracker cursor to LORE-61 on the branch (atomic with the fix), append the session-log entry via `backlog doc update doc-1`.
4. Archive this handover, write the next one pointed at LORE-61, push dev.

## Critical context / traps

- **Backlog data only via the `backlog` CLI** — never edit `backlog/**` markdown directly; read deps via `backlog task view --plain` (grep on task files falsely reports no deps).
- **LORE-61..66 (later sessions) require the real Docker harness for verification** (`docker compose -f docker/e2e/docker-compose.yml up --build`, always `down -v` after); green `bun test` alone is insufficient for harness work. LORE-67 (this session) is docs-only — no docker needed.
- `docs/.obsidian/` is untracked, pre-existing, unrelated — leave it alone.
- LORE-62 and LORE-66 depend on LORE-61's `step_fail` helper — queue order already accounts for this; do not reorder past 61.
- All seven queue tasks are self-contained (filed from the 2026-07-19 E2E coverage audit at dev @ `305efa8`) — trust the task descriptions' file:line evidence but re-verify line numbers against the current tree before editing.

## Do not repeat

- Nothing failed this session (init only). Historical trap that recurs: do not trust `run-e2e.sh` comments or docs as ground truth for behavior — verify against `src/` (LORE-60/67 both exist because docs drifted from code).
