# Handover — Phase 1 finale: LORE-33 shipped; next is LORE-48 `check` follow-ups (LORE-48)

**Date**: 2026-06-30 | **Grounded against**: `dev`=`origin/dev`=`8716b67` (clean, on `dev`); `main`=`23f3733` (intentionally behind) | **Backlog**: LORE-33 **Done** (#28); LORE-48 **To Do** (next)

## Paste-ready prompt for the next session

```
State: dev == origin/dev == 8716b67, clean, on dev, no open PRs. main == 23f3733 (intentionally
behind; do NOT promote unless asked). LORE-33 (lore query) is DONE (squash #28 = 84a914e, chore
283d48d, archive 8716b67). FIRST run `backlog instructions overview`. The master plan is at
/Users/jdnewhouse/.claude/plans/review-entire-backlog-of-mutable-origami.md — read it; it sequences
the WHOLE backlog into 4 phases, approved by Jeremy.

Next task = Phase 1 task 5 (the LAST Phase-1 task): LORE-48 `lore check` follow-ups
(`backlog task view LORE-48 --plain`). It EXTENDS the existing shipped `lore check` (core/check.ts +
commands/check.ts, from LORE-30 which is Done). LORE-48 has NO acceptance criteria defined yet —
FIRST action: read the task's Scope + Implementation Notes, draft ACs from them, and set them via
`backlog task edit LORE-48 --ac "..."` (one per scope item) before coding. Present the plan to Jeremy.

LORE-48 scope (all in the Scope + Notes of the task):
1. `--external` external-URL liveness — the flag is ALREADY parsed in commands/check.ts:55,110 and
   today just emits a "not yet implemented; ignoring it" advisory (check.ts:72-73). Implement opt-in,
   NON-deterministic liveness on a SEPARATE non-blocking path, EXCLUDED from the default deterministic
   gate (ADR-0007). No Rust/lychee/network runtime dep — use Bun's fetch. core/ stays pure (ADR-0014):
   network IO belongs in the command layer or a clearly-marked impure adapter, NOT core/check.ts's
   deterministic pass.
2. Portability lint additions (warn-only): MDX hazards (raw `</` `{` in non-code prose → Docusaurus
   MDX build errors); filename rules at the command layer (leading-underscore filenames, `.mdx` files)
   — see docs/reference/portable-markdown.md.
3. Carry-forward items parked in LORE-30 notes (from PR #19/#21 /code-review max):
   (a) accidental-colon-filename detection (`notes:2026.md` is read as a URL scheme today, skipped by
       both gate and lint — links.ts docstring over-promised this);
   (b) a PRECISE Obsidian block-ref `^id` detector (avoid carets in prose/math AND catch digit-leading
       auto-IDs like `^3f9a2b`); the naive text-node regex couldn't, so it was removed in LORE-30;
   (c) trailing-slash dir-link policy (`../reference/` flagged by neither lint nor gate — decide if a
       typo'd trailing-slash concept link should warn);
   (d) converge the finding model — share validate.ts Severity/Finding with check.ts CheckFinding
       (check.ts:51 CheckSeverity, :60 CheckFinding);
   (e) consolidate the errno→LoreError IO policy duplicated across commands/check.ts, commands/
       validate.ts, and bundle.ts readError (bundle.ts:299) into ONE errors.ts helper.
   Also: normalizeLink (core/links.ts:104-107) uses posix.relative → cwd-dependent for an absolute
   toPath or `..`-escaping fromPath; guard when non-relative paths arrive. Minor reuse/efficiency in
   links.ts (ensureMarkdownSuffix at :120 composing idFromPath; drop redundant double posix.normalize;
   hoist regex literals).

NOT in LORE-48: status-reconciliation + managed-block-drift passes of `check` — those are LORE-27,
gated on the Backlog JSON adapter (LORE-21) + lore sync (LORE-26), Phase 2. **Do LORE-48 BEFORE
LORE-27** (both edit `check`; LORE-27 layers adapter-dependent drift dims on top).

Follow the proven loop & [[lore-cli-command-pattern]]: feature branch off dev → extend the PURE
core engine, keep network/impurity OUT of core (ADR-0014) → clone any arg-parser additions verbatim
(shared-parser refactor is ACCEPTED debt; add NO new divergence) → loadBundle + flush advisories
BEFORE any throw → emit(Renderable) → --json is the ONLY machine-JSON path (NO per-command
--format json) → gates: bun test + bunx biome check src/ test/ + bunx tsc --noEmit + bun test
--coverage (core 100% func+line) → run the WORKFLOW review: Skill code-review args "max" (→ Workflow
code-review) and FOLD verified findings → CHANGELOG (Unreleased) + cli-surface.md §check if a flag
changes → backlog --check-ac/--append-notes (commit backlog edits BEFORE any dev-sync reset) → PR
into dev via the gh token. Jeremy reviews; admin squash-merge ONLY when he says so.
```

## State

| Item | Status |
| --- | --- |
| **LORE-33** (lore query) | **Done** — squash #28 (`84a914e`) + chore (`283d48d`); both ACs checked; review fold recorded |
| `dev` / `origin/dev` | both `8716b67` (incl. the archive commit); pushed; local == remote |
| `main` | `23f3733` — intentionally behind dev; do not promote unless asked |
| Open PRs | **none** (#28 merged) |
| Feature branches | **pruned** (local + remote `feat/lore-33-query` + tracking ref deleted) |
| **LORE-48** (check follow-ups) | **To Do — next**; dep LORE-30 **Done**; **NO ACs defined yet** (define them first) |
| Phase 1 status | LORE-20/31/34/33 **Done**; **LORE-48 is the last Phase-1 task** |
| Phase 2 (fork+coupling) | LORE-1→2→{3,4}→21→{22,23,24,25,32}→{26,27}; **LORE-5 parked**; nothing started |
| Shared foundation on dev | `core/query.ts` (`subgraph` + `query`/BM25), `core/context.ts`, `core/bundle.ts` (`estimateTokens`/`frontmatterScalar`), `core/check.ts`/`commands/check.ts` (LORE-30, the LORE-48 base) |

## Next steps

1. **LORE-48 `lore check` follow-ups** — `backlog task view LORE-48 --plain`; **define ACs first**
   (none exist) from the Scope/Notes, then mark In Progress. Extend `core/check.ts` /
   `commands/check.ts`. The `--external` flag already parses (`commands/check.ts:55,110`) and emits a
   deferred-notice advisory (`commands/check.ts:72-73`) — replace that with a real, opt-in,
   non-deterministic liveness path kept OUT of the deterministic gate (ADR-0007) and OUT of pure
   `core/` (ADR-0014). Add the warn-only MDX/filename lints and fold the carry-forward (a)–(e) items.
   Build to `docs/reference/cli-surface.md` §check + `docs/reference/portable-markdown.md`.
2. Then Phase 2 begins (the fork): **LORE-1** (create `jeremy-newhouse/Backlog.md` fork) → **LORE-2**
   (`--json` matching `docs/reference/backlog-json-schema.md`) → LORE-13(golden)/3/4 → LORE-21 adapter.
   ⚠ Compile the fork binary on the INTERNAL disk (`~/repos/lore`), NOT `/Volumes/external` — external
   volume `bun build --compile` fails silently to a 0-byte binary. [[external-volume-bun-exdev-traps]]

## Critical context / traps

- **ssh-agent is DOWN** (publickey denied). Route ALL git network ops via the gh token:
  `git -c credential.helper='!gh auth git-credential' push https://github.com/jeremy-newhouse/lore.git <b>:<b>`
  then `git update-ref refs/remotes/origin/<b> <sha>`. `gh`/`gh pr`/`gh api` work regardless. Remote
  branch delete = `gh api -X DELETE repos/jeremy-newhouse/lore/git/refs/heads/<b>`. [[lore-git-workflow]]
- **Commit backlog task edits BEFORE syncing dev.** A post-merge `git reset --hard` to sync dev wipes
  uncommitted task plan/notes/AC edits — and `git checkout dev` will ABORT if they're uncommitted. This
  session the LORE-33 AC-checks/review-notes were made AFTER the last feat commit, so they were NOT in
  the squash; preserved by `git stash push -- <taskfile>` → reset dev → `git stash pop` → mark Done →
  commit. Do the same: stash any post-commit backlog edits across the sync. [[dev-sync-reset-wipes-backlog-edits]]
- **Handover files are gitignored at the SOURCE** (`.claude/handovers/`), so `git mv` to archive FAILS
  ("not under version control"). Use a plain `mv` then `git add archive/handovers/`. Also: `cmd | tail`
  masks the cmd's exit code, so a `git mv … | tail || mv …` fallback never fires — run them as separate
  statements.
- **Merge convention = SQUASH + admin** → `gh pr merge <n> --squash --admin` → one `feat(LORE-N): … (#NN)`
  on dev; then direct `chore(LORE-N): mark Done (delivered via #NN)` on dev; then archive the consumed
  handover (`docs: archive consumed handover …`). Do **not** ff main unless asked.
- **Code review is the WORKFLOW one**: `Skill code-review args "max"` (calls `Workflow{name:"code-review"}`),
  NOT inline /review. LORE-33's max review found 15 verified (6 folded) — budget a real fold pass.
  [[code-review-vs-review-command]]
- **`--external` liveness must NOT enter the deterministic gate (ADR-0007) and network IO must NOT enter
  pure `core/` (ADR-0014).** Keep liveness opt-in, advisory, and on a separate non-blocking path.
- **`--json` is the only machine-JSON path.** Do NOT add a per-command `--format json` value.
- **Read deps via `backlog task view --plain`, never grep** backlog/tasks. [[backlog-dependency-grep-trap]]
- Sweep the repo root for stray smoke-test files before committing; `cd` to a temp dir for any `lore`
  WRITE command (read-only `check`/`query`/`context`/`graph` are safe to smoke in-repo).

## Do not repeat

- **Don't add speculative caching / premature micro-optimization.** LORE-33's review flagged a per-doc
  tf-Map retention and it was DEFERRED as premature for current bundle sizes (same lesson as the LORE-34
  adjacency-WeakMap revert). [[adjacency-memoization-premature]]
- **Don't hand-roll NEW arg-parser divergence** — clone the graph.ts/context.ts parser verbatim; the
  shared-parser refactor is accepted debt, but new divergence gets flagged every review. The accepted
  shared-helper debt (`readValue` 4th copy, `toHit`/`neighborOf` shaping dup) was deferred in LORE-33,
  not fixed — don't re-litigate it per-task; it's a future dedicated refactor.
- **Don't put network/liveness IO in `core/check.ts`** — it would break the ADR-0014 "core has no IO
  beyond the filesystem" purity and the ADR-0007 deterministic-gate guarantee.

## System of record updated (this session)

- **LORE-33 → Done**; ACs #1/#2 checked; notes record the impl + the folded #28 `/code-review max`
  cluster (15 verified, 6 folded: punctuation-only-text-vs-filters, case-insensitive `--field` key,
  `--field` value trim + empty-value reject, sub-0.005 score formatting, `--status`/`--tag` via shared
  matcher, IDF precompute) + the 9 deferred dispositions with rationale.
- **Code on dev** (`84a914e`): NEW `core/query.ts` `query()`/BM25 index, `commands/query.ts`, `cli.ts`
  registers `query`; `test/query.test.ts` (100% func+line). CHANGELOG Unreleased/Added updated.
- Built to the LOCKED `cli-surface.md` §query (`--limit`, NOT the task-desc's `--max-tokens` — the
  locked contract supersedes the description; noted in the task).
- Archived the consumed `HANDOVER-2026-06-29-phase1-lore-33-next.md` → `archive/handovers/` (commit `8716b67`).
- Stale auto-snapshot `HANDOVER-2026-06-22T184432Z.md` still in `.claude/handovers/` (low-fidelity; ignore/safe to delete).
