# Handover — M2 Backlog coupling: LORE-23 reconcile + LORE-24 link/unlink + wire sync/check

**Date**: 2026-07-02 | **Grounded against**: `dev`=`main`=`3e597cc` (clean, pushed, no open PRs) | **Backlog**: LORE-22 **Done** (PR #33, merged+promoted); LORE-23 / LORE-24 **To Do** (both unblocked, dep LORE-21 Done)

## Paste-ready prompt for the next session

```
FIRST run `backlog instructions overview`. Then pick up the M2 Backlog-coupling
chain. Both are unblocked (dep LORE-21 Done). Suggested order: LORE-23 → LORE-24.

LORE-23 — reconcile.ts: status rollup. Pure core engine (src/core/reconcile.ts)
that computes a Story/Spec's rolled-up `status` from its linked tasks' statuses
(consumes the LORE-21 adapter reads). See docs/adr/0009-story-task-coupling-
reconciliation.md for the rollup rules. Same shape as every lore core engine:
pure (data in → data out, no fs/spawn/clock), heavy JSDoc, LoreError-typed,
injected fakes in tests. NOT wired into cli.ts here.

LORE-24 — lore link / unlink (+ the first CLI wiring of the coupling stack).
This is where src/core/managed-block.ts (regenerateTaskBlock, shipped in LORE-22)
and reconcile.ts finally get driven by commands. `lore sync` (writes) and `lore
check` (diffs, never writes) call reconcile + managed-block over each Story with
`tasks:`. Follow the proven command shape [[lore-cli-command-pattern]]: thin
commands/X.ts over the pure core; loadBundle; the command layer reads raw file
bytes + calls adapter.viewTask(id) per linked id, builds ManagedTaskRow[] in
ADR-0008 §4 order (frontmatter `tasks:` list order), and passes docPath as the
**repo-relative** doc path (bundle-root `docs/` + bundle-relative path).

WHEN WIRING managed-block in LORE-24, fold in the DEFERRED /code-review findings
(recorded on LORE-22's task notes):
  - normalizeLink throws a BARE Error (not LoreError) on an absolute path — the
    command must pass a repo-relative docPath (or convert + raise a LoreError at
    the boundary), else `lore sync/check` crash as uncaught exit-1.
  - DRY: managed-block.ts `offsetsOf`/`Marker` duplicate rewrite.ts
    `positionOf`/`ByteRange`; `cell`/`escapeLinkText` duplicate indexes.ts
    `linkText`. Good moment to lift a shared mdast-utils / md-cell-safety helper.
  - findMarkers is tasks-only; retrofitting `lore:index` onto structural
    location (indexes.ts still uses the literal `locateManagedBlock`) is optional
    future scope, not required by LORE-24.

Finalize the standard lore way: feature branch off dev → feat(LORE-N): … (Claude
co-author + Claude-Session trailers) → PR into dev. The user reviews/merges (he
may ask for an admin-merge+promote as he did for #32/#33 — ASK, don't assume).
```

## State

| Item | Status |
| --- | --- |
| lore `dev` / `main` | both `3e597cc`, identical, pushed; tree clean; no open PRs |
| **LORE-22** (managed-block.ts) | **Done** — PR #33 (squash `22ccd6b`), `chore` `3ddf52c`, promoted to `main`; handover archived `3e597cc` |
| **LORE-23** (reconcile.ts status rollup) | **To Do**, dep LORE-21 (Done) → unblocked |
| **LORE-24** (lore link/unlink + sync/check wiring) | **To Do**, dep LORE-21 (Done) → unblocked |

## Next steps

1. `backlog task view LORE-23 --plain` (+ LORE-24); read `docs/adr/0009-story-task-coupling-reconciliation.md`.
2. LORE-23: build `src/core/reconcile.ts` (pure status rollup) + tests. Not wired to CLI.
3. LORE-24: `lore link`/`unlink` commands + wire `reconcile` + `managed-block` into `lore sync`/`lore check`; fold in the deferred findings above.

## Critical context / traps

- **managed-block.ts is READY to consume** — `regenerateTaskBlock(content, rows, {docPath})`. Input must be **LF-normalized** (it hardcodes `\n`; every lore read path normalizes via `concept.ts normalizeInput`). Markers located structurally (top-level `html` nodes; value is `.trim()`-matched — mdast keeps a marker line's surrounding whitespace in the value). Row links from `filePathRelative` via `normalizeLink`; null/empty file → plain-text id. [[lore-no-md-serializer]]
- **docPath is repo-relative** (`docs/stories/x.md`), NOT bundle-relative — both operands of `normalizeLink` must share the repo-relative space (task `filePathRelative` is repo-relative). An absolute path throws a bare `Error`.
- **Reads are JSON-only** via `createBacklogAdapter(spawn)` (`viewTask` per linked id; never `--plain`, never grep `backlog/tasks/*.md`). [[backlog-fork-checkout]] [[backlog-dependency-grep-trap]]
- **`sync` commits only `backlog/`** (lore is its sole committer); `docs/` changes are left staged-or-not per the user's workflow (design §3.4).
- **Post-merge sync trap**: sync local dev with `git pull --ff-only`, not `git reset --hard` (which would wipe uncommitted backlog edits). [[dev-sync-reset-wipes-backlog-edits]]

## System of record updated (this session — LORE-22, all landed on `dev`/`main` `3e597cc`)

- **LORE-22** → **Done** (PR #33 `22ccd6b`; `chore` `3ddf52c`; promoted). ACs #1/#2 checked; plan + notes (incl. the /code-review triage) + final-summary recorded.
- **ADR-0008** amended to the shipped no-serializer/string-splice mechanism (Status + §Decision items 1/3/6 + the pathological-markdown consequence).
- **CHANGELOG.md** (Unreleased/Added) — the `core/managed-block.ts` entry.
- **Auto-memory** [[lore-no-md-serializer]] updated: LORE-22 delivered; the mdast-keeps-marker-whitespace `.trim()` gotcha + LF precondition.
- **Predecessor handover** `HANDOVER-2026-07-02-LORE-22-managed-block.md` consumed → archived (`3e597cc`).
