# Handover — LCLI-25 (`lore tasks`) delivered as open PR #42, review-hardened, awaiting merge

**Date**: 2026-07-10 | **Grounded against**: `feat/lore-25-tasks` @ `acc75fa`; `dev` @ `8ccdfd9`; `main` @ `8ccdfd9` | **Backlog**: LCLI-25 (In Progress, both ACs checked)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`.

LCLI-25 (`lore tasks <id> [--status <S>]`) is DONE and delivered as PR #42
(feat/lore-25-tasks -> dev): OPEN, MERGEABLE, all 4 CI checks green, review-hardened
(workflow /code-review high: 9 findings -> 5 fixed, 4 declined-with-rationale, all
recorded on the LCLI-25 task). It is the user's to review/merge — do NOT self-merge
unless he says so (he explicitly authorized merging #41 earlier; #42 he chose "stop
here", so ask first).

Branch @ acc75fa (2 commits ahead of dev @ 8ccdfd9). Working tree clean. dev == main.

- If PR #42 is ALREADY MERGED: finalize LCLI-25 — `backlog task edit LCLI-25 -s Done`,
  ff-push dev->main (main has no independent history; see [[lore-finalize-shorthand]]),
  prune the branch, archive THIS handover. Then pick the next task.
- If STILL OPEN: hand it to the user to merge (or merge if he asks). Nothing code-wise
  is pending on it.

Then continue the "finish the backlog and ship" sequence:
  command surface: LCLI-32 (orphans) -> LCLI-49 (state.ts commit retrofit) ->
  LCLI-39/40 (scaffold mkdocs/docusaurus); then de-risk + ship: LCLI-14 (bun compile
  spike) -> LCLI-9 (release pipeline). Deferred/out of v1: LCLI-5, LCLI-41..45.
Recommended next pick: LCLI-32 (orphans — the bidirectional dangling-link report that
`lore tasks` defers to). Branch off dev; independent of #42. Ask the user or proceed.
```

## State

| Item | Status |
| --- | --- |
| PR #42 | **OPEN**, base `dev`, MERGEABLE, 2 commits, all 4 CI checks pass (macos·ubuntu·windows + compile-smoke); no review decision yet — awaiting user merge |
| `feat/lore-25-tasks` | `acc75fa`, pushed, 2 ahead of `dev` |
| LCLI-25 | In Progress; both ACs checked; → Done on merge |
| `dev` / `main` | both `8ccdfd9` (LCLI-38 promoted this session) |

## Next steps

1. Merge PR #42 (user's call) → then finalize LCLI-25 (mark Done; ff `dev`→`main`; prune; archive this handover).
2. Pick the next ship-sequence task — **LCLI-32 (`orphans`)** recommended (branch off `dev`; independent of #42).

## Critical context / traps

- **Shipping a new lore command is a surface-coherence RIPPLE, not just the command file.** The checklist (now in the [[lore-cli-command-pattern]] memory): `LORE_MANIFEST` entry in `cli.ts` dispatch order with `exitCodesFor([seams])`; golden exit-code row in `test/help.test.ts`; `LORE_COMMANDS` entry with a **byte-identical** summary; `bun src/cli.ts agents --force` to regen the committed SKILL.md; purge "aspirational/unshipped" claims in `manifest.ts`/`agent-bridge.ts` docstrings + the `not.toContain("lore <cmd>")` asserts in `agents.test.ts`; promote the `kind` from the "deferred" row to a real row in `cli-contract.md` §2.1. Order-sensitive lockstep + summary-drift + golden-exit tests fail CI if any is missed.
- **Envelope `data` is object-wrapped, never a bare array** (`{concept, status?, tasks:[…]}`) — the additive-only contract (cli-contract §7) needs room to grow; every list command wraps. A stale cli-surface cell that showed a bare array was corrected.
- **Backlog-adapter read discipline** (reused by LCLI-32 orphans): `adapter.probe()` UP FRONT (fail-fast 3/6) so a later `viewTask` null unambiguously = dangling `tasks:` id (soft: drop + WarningCollector stderr advisory, exit 0) vs a real throw = drift (hard: rethrow). `allSettled` + first-in-order rethrow (not `Promise.all`). Empty `tasks:` short-circuits before probing.
- **`fakeAdapter.probe` defaults to throwing** (`notImplemented`) to preserve link/rename's never-probe guard; pass `{probe:"ok"}` (capable) or `{probe:Error}` (fail) to opt in.

## Do not repeat

- **Do NOT hand-list per-command exit codes** — derive from seams (`exitCodesFor`) + the independent golden row; they must agree (LCLI-38 class of bug).
- **Do NOT ship a bare-array `--json` envelope** — the codebase convention is object-wrapped for additive-safety; verify against `query.results`/`graph.export`, not a possibly-stale doc cell.
- **Do NOT leave `fakeAdapter.probe` permissively passing for all callers** — a code-review round caught that it silently drops link/rename's never-probe guard; keep the throwing default and opt in per-test.

## System of record updated

- **LCLI-25 task** → full plan + implementation notes + the review trail (5 fixed / 4 declined with rationale); both ACs checked (committed to the branch, `acc75fa`).
- **CHANGELOG.md** → `## [Unreleased] → Added` entry for `lore tasks` (in the feat commit).
- **Docs** → `cli-contract.md` §2.1 (tasks.rollup promoted to a real kind), `cli-surface.md` §tasks (object shape, dangling behavior, exit codes), `instructions` linking topic (points at `lore tasks`).
- **Auto-memory** → [[lore-cli-command-pattern]] extended with the post-LCLI-38 surface-coherence ripple + Backlog-adapter read discipline + object-wrapped-envelope convention.
