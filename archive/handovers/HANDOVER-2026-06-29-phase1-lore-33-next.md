# Handover — Phase 1 continues: LCLI-34 shipped; next is LCLI-33 `lore query` (LCLI-33, then 48)

**Date**: 2026-06-29 | **Grounded against**: `dev`=`origin/dev`=`b125e3e` (clean, on `dev`); `main`=`23f3733` (intentionally behind) | **Backlog**: LCLI-34 **Done** (#27)

## Paste-ready prompt for the next session

```
State: dev == origin/dev == b125e3e, clean, on dev, no open PRs. main == 23f3733 (intentionally behind;
do NOT promote unless asked). LCLI-34 (lore context) is DONE (squash #27 = 63c0e31, chore e1191f1,
archive b125e3e). FIRST run `backlog instructions overview`. The master plan is at
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md — read it; it sequences the
WHOLE backlog into 4 phases, approved by Jeremy.

Next task = Phase 1 task 4: LCLI-33 `lore query` (`backlog task view LCLI-33 --plain`). Add a BM25-style
in-memory full-text search + frontmatter-field filters to the EXISTING core/query.ts (which already hosts
subgraph() and whose module header already anticipates "the BM25 full-text search behind lore query
lands here too"), then a thin commands/query.ts. Read the locked contract in docs/reference/cli-surface.md
§query and build to it. ACs: #1 filter by type/tag/status/any field; #2 bounded output with a narrow-it
hint. No vectors/RAG (ADR-0015).

REUSE the foundation LCLI-34 just shipped (all in core/, do NOT re-roll):
- core/bundle.ts `estimateTokens(text)` — the shared chars/4 kernel — for the `--max-tokens` budget.
- core/bundle.ts `frontmatterScalar(value)` — verbatim string / finite number|boolean / else undefined —
  for snippet titles (keeps `title` byte-identical across commands).
- output.ts `truncation()` / `renderTruncationLine()` — for AC#2's bounded-output §3 hint.
- "reuse summary for snippets": frontmatter `summary` is the one-line snippet source (singleLine+trim it,
  as core/context.ts's oneLine() does).

Follow the proven loop & [[lore-cli-command-pattern]]: feature branch off dev → thin command over a PURE
core engine → CLONE the graph.ts/schema.ts arg parser verbatim (shared-parser refactor is ACCEPTED debt;
just add NO new divergence) → loadBundle + flush advisories BEFORE any not_found throw → idFromPath any id
positional → emit(Renderable) → --json is the ONLY machine-JSON path (NO per-command --format json) →
gates: bun test + bunx biome check src/ test/ + bunx tsc --noEmit + bun test --coverage (core 100%
func+line) → run the WORKFLOW review: Skill code-review args "max" (→ Workflow code-review) and FOLD
verified findings → CHANGELOG (Unreleased/Added) + cli-surface.md if a flag changes → backlog
--check-ac/--append-notes (commit backlog edits BEFORE any dev-sync reset) → PR into dev via the gh token
(ssh-agent down). Jeremy reviews; admin squash-merge ONLY when he says so.

Do NOT re-add the subgraph adjacency memoization (adjacencyOf/WeakMap) — it was tried in LCLI-34 and
reverted as premature; see [[adjacency-memoization-premature]]. subgraph() rebuilds adjacency inline now.
```

## State

| Item | Status |
| --- | --- |
| **LCLI-34** (lore context) | **Done** — squash #27 (`63c0e31`) + chore (`e1191f1`); both ACs checked; review fold recorded |
| `dev` / `origin/dev` | both `b125e3e` (incl. the archive commit); pushed |
| `main` | `23f3733` — intentionally behind dev; do not promote unless asked |
| Open PRs | **none** (#27 merged) |
| Feature branches | **pruned** (local + remote `feat/lore-34-context` + tracking ref deleted) |
| Phase 1 remaining | **LCLI-33 query (next)**, then **LCLI-48 check follow-ups** |
| Shared foundation now on dev | `core/query.ts` `subgraph()`; `core/context.ts` `buildContext()`; `core/bundle.ts` `estimateTokens` + `frontmatterScalar` (NEW — reuse for LCLI-33) |
| Phase 2 (fork+coupling) | LCLI-1→2→{3,4}→21→{22,23,24,25,32}→{26,27}; **LCLI-5 parked**; nothing started |

## Next steps

1. **LCLI-33 `lore query`** — `backlog task view LCLI-33 --plain`; mark In Progress. BM25 full-text +
   frontmatter filters (`--type`/`--tag`/`--status`/`--field`) in the existing `core/query.ts`; thin
   `commands/query.ts`. Build to `docs/reference/cli-surface.md` §query. Reuse `estimateTokens`,
   `frontmatterScalar`, `truncation()`/`renderTruncationLine()`, and `summary` for snippets. No vectors.
2. Then **LCLI-48 `check` follow-ups** (deps LCLI-30 **Done**) — extend `core/check.ts`/`commands/check.ts`
   with `--external` liveness, MDX hazard lint, filename-portability rules, **plus the carried-forward
   items detailed in its ACs**: (a) accidental-colon-filename detection (`notes:2026.md`), (b) a precise
   Obsidian block-ref `^id` detector, (c) trailing-slash dir-link policy, (d) converge `validate.ts`
   Severity/Finding with `check.ts` CheckFinding, (e) consolidate the errno→LoreError IO helper across
   `commands/check.ts`/`commands/validate.ts`/`bundle.ts readError`. **Do LCLI-48 BEFORE LCLI-27** (both
   edit `check`; LCLI-27 layers the adapter-dependent drift dims on top).

## Critical context / traps

- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>`
  then `git update-ref refs/remotes/origin/<b> <sha>`. `gh`/`gh pr`/`gh api` work regardless. [[lore-git-workflow]]
- **Commit backlog task edits BEFORE syncing dev.** A post-merge `git reset --hard` to sync dev wipes
  uncommitted task plan/notes/AC edits. This session that was handled by committing the review-fold notes
  to the feature branch so the squash carried them. [[dev-sync-reset-wipes-backlog-edits]]
- **Merge convention = SQUASH + admin** → `gh pr merge <n> --squash --admin` → one `feat(LORE-N): … (#NN)`
  on dev; then direct `chore(LORE-N): mark Done (delivered via #NN)` on dev; then archive the consumed
  handover (`docs: archive consumed handover …`). Do **not** ff main unless asked.
- **Code review is the WORKFLOW one**: `Skill code-review args "max"` (calls `Workflow{name:"code-review"}`),
  NOT inline /review. LCLI-34's max review found 12 verified (target-body budget honesty, title divergence,
  premature cache) — budget a real fold pass. [[code-review-vs-review-command]]
- **`--json` is the only machine-JSON path.** Do NOT add a per-command `--format json` value.
- **Do NOT re-add the subgraph adjacency cache** — reverted in LCLI-34. [[adjacency-memoization-premature]]
- **Read deps via `backlog task view --plain`, never grep** backlog/tasks. [[backlog-dependency-grep-trap]]
- Sweep the repo root for stray smoke-test redirect files before committing; `cd` to a temp dir for any
  `lore` WRITE command (read-only `query`/`context`/`graph` are safe to smoke in-repo).

## Do not repeat

- **Don't add speculative caching** (the LCLI-34 review reverted the adjacency `WeakMap`: no shipping
  command traverses a graph twice/run, and it exported a mutable shared map). Add `adjacencyOf` only when
  `lore orphans` (LCLI-32) lands. [[adjacency-memoization-premature]]
- **Don't hand-roll NEW arg-parser divergence** — clone the graph.ts/schema.ts parser verbatim; the
  shared-parser refactor is accepted debt, but new divergence gets flagged every review (LCLI-34's
  parseCount clone was flagged but accepted as no-new-divergence).
- **Don't let the neighbor/snippet token cost charge only the summary** — LCLI-34's review showed the
  id+type overhead must be charged too, or a wide result set overruns `--max-tokens` while reporting fit.

## System of record updated (this session)

- **LCLI-34 → Done**; ACs #1/#2 checked; notes record the impl + the folded #27 `/code-review max` cluster
  (12 verified) + the deferred/refuted dispositions.
- **Code on dev** (`63c0e31`): NEW `core/context.ts` (`buildContext`), `commands/context.ts`, `cli.ts`
  registers `context`; `core/query.ts` (adjacency cache reverted); `core/bundle.ts` (`estimateTokens` +
  `frontmatterScalar` extracted); `core/graph.ts` (uses `frontmatterScalar`); `test/context.test.ts`.
- **CHANGELOG.md** + **docs/reference/cli-surface.md** §context (exit row) updated and on dev.
- **Auto-memory**: added [[adjacency-memoization-premature]].
- Archived the consumed `HANDOVER-2026-06-29-LCLI-34-context-next.md` → `archive/handovers/` (commit `b125e3e`).
- Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` still in `.claude/handovers/` (low-fidelity; ignore).
