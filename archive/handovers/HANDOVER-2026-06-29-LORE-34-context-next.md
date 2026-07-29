# Handover — Phase 1 continues: LCLI-31 shipped; next is LCLI-34 `lore context` (LCLI-34, 33, 48)

**Date**: 2026-06-29 | **Grounded against**: `dev`=`origin/dev`=`e950ad2` (clean, on `dev`); `main`=`23f3733` (intentionally behind) | **Backlog**: LCLI-31 **Done** (#26)

## Paste-ready prompt for the next session

```
State: dev == origin/dev == e950ad2, clean, no open PRs. main == 23f3733 (intentionally behind; do
NOT promote unless asked). LCLI-31 (lore graph) is DONE (squash #26 = 1fb8b27, then chore e950ad2).
FIRST run `backlog instructions overview`. The master plan is at
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md — read it; it sequences
the WHOLE backlog into 4 phases, approved by Jeremy.

Next task = Phase 1 task 3: LCLI-34 `lore context` (`backlog task view LCLI-34 --plain`). Build a NEW
pure core/context.ts (token-budgeted graph expansion) that REUSES the shared core/query.ts subgraph()
traversal already shipped in LCLI-31, then a thin commands/context.ts. Contract is locked in
docs/reference/cli-surface.md §context: `lore context <id> [--max-tokens <n>] [--depth <n>]` →
kind: context.export — target body + one-line `summary` neighbor compaction, with tokenEstimate/
truncated; exit 0 ok · 3 <id> not found. NO ranking (purely structural; that's query's job). Default
depth 1. Use graph.tokenEstimate to trim to --max-tokens; emit truncation() / renderTruncationLine().

FOLD HERE the deferred LCLI-31 finding: memoize the BundleGraph adjacency in core/query.ts (build it
once / cache on the graph like tokenEstimate does) — context calls subgraph() per-target so the
un-memoized O(E) rebuild matters now.

Follow the proven loop & the [[lore-cli-command-pattern]] memory: feature branch off dev → thin
command over a PURE core engine → clone schema.ts parser, idFromPath the <id>, loadBundle + flush
advisories BEFORE any not_found throw, emit(Renderable), --json is the only machine-JSON path (no
per-command --format json) → gates: bun test + bunx biome check src/ test/ + bunx tsc --noEmit +
bun test --coverage (core 100% func+line) → run the WORKFLOW code-review: Skill code-review args
"max" (→ Workflow code-review) and FOLD verified findings → CHANGELOG (Unreleased/Added) +
cli-surface.md if a flag changes → backlog task edit --check-ac / --notes → PR into dev via gh token
(ssh-agent down). Jeremy reviews; admin squash-merge ONLY when he says so.
```

## State

| Item | Status |
| --- | --- |
| **LCLI-31** (lore graph) | **Done** — squash #26 (`1fb8b27`) + chore (`e950ad2`); both ACs checked |
| `dev` / `origin/dev` | both `e950ad2`; pushed |
| `main` | `23f3733` — intentionally behind dev; do not promote unless asked |
| Open PRs | **none** |
| Feature branches | **pruned** (local + remote `feat/lore-31-graph` + tracking ref deleted) |
| Phase 1 remaining | **LCLI-34 context (next)**, LCLI-33 query, LCLI-48 check follow-ups |
| Shared foundation shipped | `core/query.ts` `subgraph()` (undirected, cycle-tolerant, depth-bounded) — context/orphans reuse it |
| Phase 2 (fork+coupling) | LCLI-1→2→{3,4}→21→{22,23,24,25,32}→{26-sync,27}; **LCLI-5 parked**; nothing started |

## Next steps

1. **LCLI-34 `lore context`** — `backlog task view LCLI-34 --plain`; mark In Progress. New pure
   `core/context.ts` reusing `core/query.ts` `subgraph()`; thin `commands/context.ts`. Build to
   `docs/reference/cli-surface.md` §context (args `<id>`; flags `--max-tokens <n>`, `--depth <n>`
   default 1; `kind: context.export`; exit 0/3). Target body + one-line `summary` neighbor compaction,
   trimmed to `--max-tokens` via `graph.tokenEstimate`; `truncation()`/`renderTruncationLine()`. No ranking.
2. **Fold the deferred adjacency-memoization** into `core/query.ts` while here (context calls
   `subgraph()` per-target). Add a test that two `subgraph()` calls don't rebuild.
3. Then **LCLI-33 `query`** (BM25 in the existing `core/query.ts`) and **LCLI-48 `check` follow-ups**
   (extend `core/check.ts`/`commands/check.ts`; do it BEFORE LCLI-27 since both edit `check`).

## Critical context / traps

- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>` then `git update-ref refs/remotes/origin/<b> <sha>`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Syncing dev after a squash-merge with `git reset --hard` WIPES uncommitted backlog task edits**
  (the In-Progress plan/notes/AC checks live only in the working tree). Re-apply status Done + `--notes`
  + `--check-ac` AFTER the reset, before the `chore: mark Done` commit. [[dev-sync-reset-wipes-backlog-edits]]
- **Merge convention = SQUASH + admin** → `gh pr merge <n> --squash --admin` → one `feat(LORE-N): … (#NN)`
  on dev; then direct `chore(LORE-N): mark Done (delivered via #NN)` on dev. Do **not** ff main unless asked.
- **Code review is the WORKFLOW one**: `Skill code-review args "max"` (it calls `Workflow{name:"code-review"}`),
  NOT inline /review. Budget a real fold pass (LCLI-31 surfaced 14 verified findings). [[code-review-vs-review-command]]
- **`--json` is the only machine-JSON path.** Do NOT add a per-command `--format json` value — on LCLI-31 it
  read as a trap and was dropped for a `--dot` flag. A distinct serialization gets its own boolean flag.
- **Read deps via `backlog task view --plain`, never grep** backlog/tasks. [[backlog-dependency-grep-trap]]
- Sweep the repo root for stray smoke-test redirect files (`err.txt`/`out.json`) before committing.

## Do not repeat

- **Don't run a `lore` write command with cwd = the repo root** (writes land in the working tree). `lore
  graph`/`context` are read-only so they're safe to smoke in-repo, but `cd` to a temp dir for any write command.
- **Don't trust that In-Progress backlog notes survived the dev-sync reset** — they didn't this session
  (had to reconstruct LCLI-31's notes/ACs after `reset --hard`).
- **Don't hand-roll NEW arg-parser divergence** — clone schema.ts's parser verbatim; the shared-parser
  refactor is accepted debt, but new divergence gets flagged every review.

## System of record updated (this session)

- **LCLI-31 → Done**; ACs #1/#2 checked; notes record the impl + the folded #26 code-review cluster +
  the `--format`→`--dot` decision + deferred items.
- **CHANGELOG.md** (on dev `e950ad2`): `lore graph` Added entry (post-fold, `--dot` behavior).
- **docs/reference/cli-surface.md** (on dev): graph §updated `--format dot|json` → `--dot`; exit codes; id normalization.
- **Code on dev** (`e950ad2`): NEW `core/query.ts` (`subgraph`), `core/graph.ts` (shaping + DOT),
  `commands/graph.ts`, `cli.ts` registers `graph`, `test/graph.test.ts`.
- **Auto-memory**: added [[lore-cli-command-pattern]] and [[dev-sync-reset-wipes-backlog-edits]];
  corrected the reserved-hub note in [[rewriteinbound-shared-engine-traps]] (read-only graph correctly
  shows the root index node).
- Archived the consumed `HANDOVER-2026-06-28-backlog-plan-lore-31-next.md` → `archive/handovers/`.
- Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` still in `.claude/handovers/` (low-fidelity; ignore).
