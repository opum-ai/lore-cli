# Handover — Backlog plan underway: LCLI-20 shipped; next is Phase 1 / LCLI-31 (lore graph)

**Date**: 2026-06-28 | **Grounded against**: `dev`=`main`=`origin/dev`=`origin/main`=`23f3733` (clean, on `dev`) | **Backlog**: LCLI-20 **Done** (#25)

## Paste-ready prompt for the next session

```
State: dev == main == origin == 23f3733, clean, no open PRs. LCLI-20 (lore schema export) is DONE
(squash #25 = bdbbf27, then chore 23f3733; main was fast-forwarded to dev and pushed). FIRST run
`backlog instructions overview`. The master plan is at
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md — read it; it sequences
the WHOLE backlog into 4 phases, approved by Jeremy, optimized for no-rework.

Locked decisions from the planning session:
  - Order: Phase 1 fork-independent commands → Phase 2 Backlog fork + coupling → Phase 3 agent
    bridge/scaffold/manifest → Phase 4 release & deferred.
  - Upstream Backlog.md --json: FORK IT PRIVATELY and implement only the --json we need, consume as a
    git dep — NO upstream issue, NO PR yet. ⇒ LCLI-5 is PARKED (re-scope in backlog when reached).
    (Verified this session: no jeremy-newhouse/Backlog.md fork, no upstream issue/PR exist.)

Next task = Phase 1 task 2: LCLI-31 `lore graph` (`backlog task view LCLI-31 --plain`). Build the
shared `core/query.ts` graph-traversal helper HERE (graph→context→query reuse it), then the thin
command. Then LCLI-34 `context` (+core/context.ts), LCLI-33 `query` (BM25 in core/query.ts),
LCLI-48 check follow-ups. All read the existing BundleGraph (loadBundle), clone the
commands/rename.ts|supersede.ts|schema.ts shape, emit via output.ts emit()/Renderable.

Per-task loop (proven on #22/#23/#24/#25): feature branch off dev → thin command over a PURE core/
engine → gates: `bun test` + `bunx biome check src/ test/` + `bunx tsc --noEmit` + `bun test
--coverage` (core 100% func) → run the WORKFLOW code-review (NOT inline): Workflow({name:
"code-review", args:"max"}); FOLD verified findings (it found 15 real ones on LCLI-20, incl. a
data-loss slug collision) → CHANGELOG (Unreleased/Added) → `backlog task edit --append-notes`
+ `--check-ac` → PR into dev via gh token. Jeremy reviews; admin-merge ONLY when he says so.
```

## State

| Item | Status |
| --- | --- |
| **LCLI-20** (lore schema export) | **Done** — squash #25 (`bdbbf27`) + chore `23f3733` |
| `dev` / `main` | both `23f3733` == origin; **main fast-forwarded & pushed this session** (Jeremy asked) |
| Open PRs | **none** |
| Feature branches | **pruned** (local + remote `feat/lore-20-schema-export` deleted; tracking ref pruned) |
| Phase 1 remaining | LCLI-31 graph, LCLI-34 context, LCLI-33 query, LCLI-48 check follow-ups |
| Phase 2 (fork+coupling) | LCLI-1→2→{3,4}→21→{22,23,24,25,32}→{26,27}; **LCLI-5 parked** |
| Phase 3 / 4 | LCLI-37→36→38, LCLI-39/40/41 / release (9,14,45), deferred (42,43,44) |

## Critical context / traps

- **Master plan file**: `/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md`
  — the authoritative sequencing + per-task file/reuse map. Start there, not from memory.
- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token:
  push `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>` then `git update-ref refs/remotes/origin/<b> <sha>`;
  ff main: `git merge --ff-only <devsha>` then token-push `main:main`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Merge convention = SQUASH + admin** → `gh pr merge <n> --squash --admin` → one `feat(LORE-N): … (#NN)` on dev; then **direct** `chore(LORE-N): mark Done` on dev; then ff main if asked.
- **Code review is the WORKFLOW one**, not inline: `Workflow({name:"code-review", args:"max"})`; results arrive by task-notification. [[code-review-vs-review-command]]
- **`--milestone` filter fuzzy-matches the LABEL** (`m-0`→label "M0"), so it's off-by-one vs milestone IDs. Trust `backlog milestone list` + `backlog task view <id> --plain`, not the milestone filter. Read deps via `task view --plain`, never grep. [[backlog-dependency-grep-trap]]
- **Shared schema emitter**: `core/schema.ts:emitSchemaFiles` is the single byte-source for schema files; `core/scaffold.ts` (init) + `commands/schema.ts` both use it. **Slug uniqueness** is now enforced at profile load (`core/profile.ts` `seenSlugs`) — protects schema + template file naming. Reuse this pattern (one pure emitter, thin callers) for the next commands.
- New commands clone `commands/schema.ts` (newest): hand-rolled parser, `loadBundle`/`loadProfile`, `emit(Renderable)`, `LoreError`/exit codes 2/3/4/5/6, `fswrite` seam. CLI contract is locked in `docs/reference/cli-surface.md` — build to it.

## Do not repeat

- **Don't run a `lore` write command with cwd = the repo root** — I once ran `bun src/cli.ts schema
  export` in the repo and it wrote `.lore/schemas/` into the working tree (had to `rm -rf`). Always
  cd to a temp dir for CLI smoke tests.
- **Don't hand-roll a 7th arg-parser/`usage()`/`plural()` copy as if it's fine** — code-review flags
  it every time; it's accepted debt for now (a separate "shared option parser" refactor task), but
  don't add NEW divergence (the LCLI-20 copy lost new.ts's flag-as-value guard until folded).
- **Don't skip the workflow code-review** on a new command — 15 verified findings on a "small" one,
  including a silent data-loss slug collision and an unconfined `--out`.

## System of record updated (this session)

- **LCLI-20 → Done**; ACs #1/#2 checked; notes record the impl + the folded #25 code-review cluster.
- **CHANGELOG.md** (on dev): `lore schema export` Added entry (post-fold behavior).
- **Code on dev/main** (`23f3733`): NEW `commands/schema.ts`, `core/schema.ts` `emitSchemaFiles`,
  `core/scaffold.ts` delegates to it, `core/profile.ts` slug-uniqueness guard, `cli.ts` registers
  `schema`, `test/schema-export.test.ts` + `cli.ts` schema dispatch tests.
- **Master plan** written at the plans path above (the multi-phase backlog sequencing).
- This session also archived the consumed `HANDOVER-2026-06-28-lore-35-complete.md` (folded into #25's squash).
- Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` still sits in `.claude/handovers/` (low-fidelity; ignore or let pre-compact rotate it).
