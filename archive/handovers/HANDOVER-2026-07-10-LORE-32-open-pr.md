# Handover — LORE-32 `lore orphans` shipped as open PR #43; then finalize + continue ship sequence

**Date**: 2026-07-10 | **Grounded against**: `feat/lore-32-orphans` @ `8e2bc09`; `dev` @ `11d4be0` (unchanged) | **Backlog**: LORE-32 In Progress (PR #43), LORE-51 To Do (new)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

LORE-32 (`lore orphans`) is DONE and delivered as open PR #43 → dev (all CI green:
lint/typecheck/test on macos+ubuntu+windows, compile smoke). Branch feat/lore-32-orphans
@ 8e2bc09. The user reviews/merges PRs himself — do NOT self-merge; ask per PR (he
authorized merging #41/#42 only when he said so).

STEP 1 — reconcile #43:
  - `gh pr view 43` + `gh pr checks 43`. If MERGED already: run the finalize (below).
    If OPEN: it's ready — offer to review/merge, or wait for his go-ahead.

STEP 2 — on merge, finalize LORE-32 (the standard lore close-out):
  - `backlog task edit LORE-32 -s Done`  (task file already carries the final summary +
    review disposition + PR link, committed in 8e2bc09 so a dev-sync reset can't wipe it —
    see [[dev-sync-reset-wipes-backlog-edits]]).
  - ff dev→main (main has no independent history), prune feat/lore-32-orphans.
  - Archive THIS handover: `git mv .claude/handovers/HANDOVER-2026-07-10-LORE-32-open-pr.md
    archive/handovers/` + commit `docs: archive consumed handover LORE-32-open-pr`.

STEP 3 — continue the "finish the backlog and ship" sequence (all To Do):
  RECOMMENDED NEXT FEATURE: LORE-49 (retrofit link/unlink/rename to commit backlog/ via
  state.ts) → then LORE-39/40 (lore scaffold mkdocs / docusaurus+build-smoke) → LORE-14
  (Bun compile spike) → LORE-9 (release pipeline). Deferred/out-of-v1: LORE-5, LORE-41..45.
  ALSO QUEUED: LORE-51 (LOW, cleanup) — dedup the task-summary-row type + aligned-row
  renderer across tasks.ts/orphans.ts (a code-review follow-up from #43); slot in anytime.

Per-task loop (unchanged): feature branch off dev → plan on the task → implement → gates
(bun test / biome check / tsc) → workflow `/code-review high` → fold fixes → CHANGELOG +
backlog notes/ACs → PR into dev. On merge: finalize as in STEP 2.
```

## State

| Item | Status |
| --- | --- |
| LORE-32 (`lore orphans`) | **In Progress** — delivered via **PR #43** (OPEN, mergeable, all CI green) |
| `feat/lore-32-orphans` | `8e2bc09` pushed (feat 65fea1c + task-metadata 8e2bc09) |
| `dev` / `main` | both `11d4be0`, unchanged this session |
| LORE-51 (render dedup) | **To Do** — new, LOW; cross-cutting cleanup from #43 review |
| LORE-49 / 39 / 40 / 14 / 9 | all **To Do** — the remaining ship sequence |

## Next steps

1. `gh pr checks 43` → if merged, finalize LORE-32 (mark Done, ff dev→main, prune, archive this handover); if open, it's ready for the user's review/merge.
2. Then branch `feat/lore-49-*` off `dev` and continue the sequence (LORE-49 next).
3. LORE-51 is an available LOW-pri cleanup (tasks.ts + orphans.ts render layer) whenever it fits.

## Critical context / traps

- **Shipping a command is a surface-coherence RIPPLE** (all-or-CI-fails), captured in [[lore-cli-command-pattern]]: cli.ts dispatch + manifest entry (`exitCodesFor([seams])` + drop any "aspirational" claim) + `test/help.test.ts` golden exit-code row + `LORE_COMMANDS` byte-identical summary + `bun src/cli.ts agents --force` (regen SKILL.md) + `test/agents.test.ts` phantom-list + promote the `kind` from cli-contract §2.1's deferred row. The **order-sensitive** lockstep test (`help.test.ts` reverse) pins manifest order == cli.ts `switch` case order — insert in the SAME slot both places.
- **Backlog: archived == deleted through the adapter** (new, verified 2026-07-10; now in [[backlog-md-integration-contract]]): `backlog task archive` drops a task from BOTH `task list` AND `task view` (reads as not-found), and the JSON-only adapter never reads `backlog/archive/tasks/` (ADR-0002). So a doc linking an archived task reads as a dangling link in `orphans` / dropped in `tasks` — **by design, consistent**, not a bug (this was a `/code-review` finding correctly dispositioned, not fixed).
- **`--json` data is object-wrapped, never a bare array** (`orphans.report` = `{ orphanTasks?, danglingLinks? }`); a flag-excluded section is **omitted**, not `[]`, so a filtered `--json` can't be misread as "found none".
- **`backlog` on PATH here is STOCK v1.47.1** (no `--json`) — so a live `lore orphans`/`check`/`sync`/`tasks` against real Backlog fails the probe with exit 6. Tests use the injected `fakeAdapter` (real bundle on disk); that is the real end-to-end coverage. `fakeAdapter.listTasks` is **opt-in** (`{listTasks:"ok"|Error}`, default throws) — mirrors the `probe` opt, preserving the link/rename/tasks never-snapshot guard.
- **`Math.max(...hugeArray)` throws** — orphans uses a spread-free `maxLen` loop; tasks.ts still has the bounded-input spread (folded into LORE-51).

## Do not repeat

- **Do NOT treat the archived-task "dangling" report as a bug to fix** — lore cannot distinguish archived from deleted via the JSON-only adapter; it is by-design and consistent with `lore tasks`. (Re-litigated and settled this session.)
- **Do NOT leave backlog task final-summary/notes uncommitted across a merge** — a dev-sync `git reset --hard` wipes them ([[dev-sync-reset-wipes-backlog-edits]]); committed onto the feature branch (8e2bc09) this time so no re-apply is needed.
- **Do NOT hand-list per-command exit codes or ship a bare-array `--json`** — derive codes from seams + the independent golden row; object-wrap the envelope.

## System of record updated (this session)

- **LORE-32 task** → plan, notes (full review disposition), ACs #1/#2 checked, final summary, PR-link comment — committed (8e2bc09).
- **LORE-51** → created (dedup task-summary row type + aligned renderer across tasks/orphans; carries the spread-free-maxLen note for tasks.ts).
- **CHANGELOG.md** → Unreleased→Added entry for `lore orphans`.
- **Docs** → `cli-contract.md` §2.1 (`orphans.report` promoted to a real kind; `scaffold.result` stays deferred). `cli-surface.md` §orphans already authored ahead — unchanged.
- **Auto-memory** → [[backlog-md-integration-contract]] extended with the archived==deleted fact.
